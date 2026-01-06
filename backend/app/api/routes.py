from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Body, Query
from fastapi.responses import FileResponse, StreamingResponse
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel
from app.schemas import ModelInfo, BatchRequest, JobResponse, UserResponse
from app.core.config import settings
from app.services.leonardo_client import LeonardoClient
from app.services.queue_manager import queue_manager, JobStatus
from app.services.storage import storage_service
from app.services.db import get_history, get_gallery, update_tag, export_gallery, generate_export_csv, save_prompt_enhancement, get_enhancement_by_number
import uuid
import shutil
import os
import tempfile
import httpx
import asyncio
import csv
import io
import re

router = APIRouter()

# === Schemas ===
class TagUpdateRequest(BaseModel):
    tag: str  # "accept", "maybe", "declined"

class PromptEnhanceRequest(BaseModel):
    prompts: List[str]  # List of prompts with optional [number] prefix
    style_phrases: Optional[str] = None  # Additional style/enhancement context
    openai_api_key: str
    model: str = "gpt-4o-mini"

class ClassifiedPrompt(BaseModel):
    group: int
    number: str
    variants: str
    prompt: str
    chest_type: str
    cape: str
    arborist: str
    is_valid: bool = True
    validation_notes: str = ""

# === Classification Helper Functions ===

def detect_chest_type(prompt: str) -> tuple[str, List[str]]:
    """Detect chest emblem type from prompt. Returns (chest_type, matched_keywords)."""
    prompt_lower = prompt.lower()
    
    # Detection patterns for each chest type
    patterns = {
        "SUI": [
            r'\bsui\s+logo\b', r'\bsui\b(?!\s+logo)', r'\bdroplet[- ]shaped\b.*\bemblem\b',
            r'\bs[- ]curve\b.*\bemblem\b', r'\bdroplet\b.*\blogo\b', r'\bsui\s+emblem\b',
            r'\bsui\s+symbol\b'
        ],
        "Gem": [
            r'\bcrystal\s+gem\b', r'\bfaceted\s+gem\b', r'\bfractured\s+gem\b',
            r'\bcrystal\s+emblem\b', r'\bgem\s+emblem\b', r'\bcrystalline\b.*\bchest\b',
            r'\bfaceted\s+crystal\b', r'\bgem\b.*\bchest\b', r'\bchest\b.*\bgem\b'
        ],
        "Tree": [
            r'\btree[- ]of[- ]life\b', r'\broot\s+pattern\b', r'\broots\b.*\bemblem\b',
            r'\boak\b.*\bemblem\b', r'\bpine\b.*\bemblem\b', r'\btrunk\s+cross[- ]section\b',
            r'\btree\s+emblem\b', r'\broot\s+emblem\b', r'\barboreal\b.*\bchest\b'
        ],
        "Star": [
            r'\bgolden\s+star\b', r'\bfive[- ]pointed\s+star\b', r'\bstar\s+emblem\b',
            r'\b5[- ]pointed\s+star\b', r'\bgold\s+star\b.*\bchest\b', r'\bstar\b.*\bchest\b',
            r'\bchest\b.*\bstar\b'
        ]
    }
    
    matches = []
    for chest_type, type_patterns in patterns.items():
        for pattern in type_patterns:
            if re.search(pattern, prompt_lower):
                matches.append(chest_type)
                break
    
    # Remove duplicates while preserving order
    unique_matches = list(dict.fromkeys(matches))
    
    if len(unique_matches) == 0:
        return ("Unknown", [])
    elif len(unique_matches) == 1:
        return (unique_matches[0], unique_matches)
    else:
        return ("Ambiguous", unique_matches)

def detect_cape(prompt: str) -> str:
    """Detect cape presence. Returns 'No Cape', 'Cape', or 'Unknown'."""
    prompt_lower = prompt.lower()
    
    # Check for explicit "no cape" first
    no_cape_patterns = [
        r'\bno\s+cape\b', r'\bwearing\s+no\s+cape\b', r'\bwithout\s+cape\b',
        r'\bcapeless\b', r'\bno\s+cloak\b'
    ]
    for pattern in no_cape_patterns:
        if re.search(pattern, prompt_lower):
            return "No Cape"
    
    # Check for cape presence
    cape_patterns = [
        r'\bcape\b', r'\bcloak\b', r'\bflowing\s+cape\b', r'\bsilk\s+cape\b',
        r'\bemerald\s+cape\b', r'\bmatte\s+black\s+cape\b', r'\bleaf\s+cape\b',
        r'\bmantle\b'
    ]
    for pattern in cape_patterns:
        if re.search(pattern, prompt_lower):
            return "Cape"
    
    # Default to Cape if not specified (based on the taxonomy assumption)
    return "Cape"

def detect_arborist(prompt: str) -> str:
    """Detect arborist gear. Returns 'Yes' or 'No'."""
    prompt_lower = prompt.lower()
    
    arborist_patterns = [
        r'\barborist\s+gear\b', r'\barborist\b', r'\bhelmet\b.*\brope\s+harness\b',
        r'\brope\s+harness\b.*\bhelmet\b', r'\bclimbing\s+gear\b', r'\btree\s+climber\b',
        r'\bhelmet\s+and\s+harness\b', r'\bharness\s+and\s+helmet\b'
    ]
    
    for pattern in arborist_patterns:
        if re.search(pattern, prompt_lower):
            return "Yes"
    
    return "No"

def get_group_number(chest_type: str, cape: str, arborist: str) -> int:
    """Map chest/cape/arborist to group number 1-12."""
    # Group mapping based on the taxonomy
    mapping = {
        # SUI: Groups 1-3
        ("SUI", "Cape", "Yes"): 1,
        ("SUI", "Cape", "No"): 2,
        ("SUI", "No Cape", "No"): 3,
        # Gem: Groups 4-6
        ("Gem", "Cape", "Yes"): 4,
        ("Gem", "Cape", "No"): 5,
        ("Gem", "No Cape", "No"): 6,
        # Tree: Groups 7-9
        ("Tree", "Cape", "Yes"): 7,
        ("Tree", "Cape", "No"): 8,
        ("Tree", "No Cape", "No"): 9,
        # Star: Groups 10-12
        ("Star", "Cape", "Yes"): 10,
        ("Star", "Cape", "No"): 11,
        ("Star", "No Cape", "No"): 12,
    }
    
    key = (chest_type, cape, arborist)
    return mapping.get(key, 0)  # 0 for invalid/unknown combinations

def generate_variant_label(chest_type: str, cape: str, arborist: str) -> str:
    """Generate human-readable variant label."""
    arborist_label = "Arborist" if arborist == "Yes" else "Standard"
    return f"{chest_type} + {cape} + {arborist_label}"

def classify_prompt(number: str, prompt: str) -> Dict[str, Any]:
    """Classify a single prompt according to the 12-group taxonomy."""
    chest_type, matched_emblems = detect_chest_type(prompt)
    cape = detect_cape(prompt)
    arborist = detect_arborist(prompt)
    
    is_valid = True
    validation_notes = []
    
    # Validation checks
    if chest_type == "Unknown":
        is_valid = False
        validation_notes.append("Missing chest emblem")
    elif chest_type == "Ambiguous":
        is_valid = False
        validation_notes.append(f"Multiple chest emblems detected: {', '.join(matched_emblems)}")
        chest_type = matched_emblems[0]  # Use first match for grouping
    
    # Check for invalid combination: Arborist + No Cape
    if arborist == "Yes" and cape == "No Cape":
        validation_notes.append("Warning: Arborist usually implies Cape (no matching group)")
        cape = "Cape"  # Normalize to valid combination
    
    group = get_group_number(chest_type, cape, arborist)
    if group == 0:
        is_valid = False
        validation_notes.append(f"No valid group for combination: {chest_type}/{cape}/{arborist}")
        group = 1  # Default fallback
    
    variants = generate_variant_label(chest_type, cape, arborist)
    
    return {
        "group": group,
        "number": number,
        "variants": variants,
        "prompt": prompt,
        "chest_type": chest_type,
        "cape": cape,
        "arborist": arborist,
        "is_valid": is_valid,
        "validation_notes": "; ".join(validation_notes) if validation_notes else ""
    }

# === Classification Endpoint ===

@router.post("/classify-prompts")
async def classify_prompts(file: UploadFile = File(...)):
    """
    Classify prompts from a CSV file into 12 groups based on chest emblem, cape, and arborist.
    
    Input CSV must have 'Number' and 'Prompt' columns (case-insensitive).
    Returns classified data with group assignments.
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")
    
    try:
        contents = await file.read()
        text_content = contents.decode('utf-8')
        
        # Use csv.reader for more flexibility with headers
        f = io.StringIO(text_content)
        reader = csv.reader(f)
        rows = list(reader)
        
        if not rows:
            raise HTTPException(status_code=400, detail="CSV file is empty")
            
        header_row = rows[0]
        number_idx = -1
        prompt_idx = -1
        
        # Strategy 1: Look for specific headers in the first row
        for idx, col in enumerate(header_row):
            clean_col = col.strip().lower()
            if clean_col == 'number':
                number_idx = idx
            elif clean_col == 'prompt':
                prompt_idx = idx
                
        # Strategy 2: If headers not found, assume position if row count > 1
        # Assumes Column 0 = Number, Column 1 = Prompt
        start_row_index = 1
        if number_idx == -1 or prompt_idx == -1:
            # Check if first row looks like data (e.g. number is digit)
            # If strictly digit, likely data. If text, likely header.
            first_cell = header_row[0].strip()
            if first_cell.isdigit():
                # First row is data, assume 0=Number, 1=Prompt
                number_idx = 0
                prompt_idx = 1
                start_row_index = 0
            else:
                # First row might be unknown headers, but let's try to map 0 and 1 anyway
                # defaulting to 0 and 1 if we have at least 2 cols
                if len(header_row) >= 2:
                    number_idx = 0
                    prompt_idx = 1
                    # We assume first row is header since it wasn't digits
                    start_row_index = 1
                else:
                     raise HTTPException(
                        status_code=400, 
                        detail=f"Could not confirm 'Number' and 'Prompt' columns. Found: {header_row}"
                    )
        
        # Classify each row
        results = []
        group_counts = {i: 0 for i in range(1, 13)}
        invalid_count = 0
        
        for i in range(start_row_index, len(rows)):
            row = rows[i]
            if len(row) <= max(number_idx, prompt_idx):
                continue
                
            number = row[number_idx].strip()
            prompt = row[prompt_idx].strip()
            
            if not prompt:
                continue
            
            classified = classify_prompt(str(number), prompt)
            results.append(classified)
            
            if classified["is_valid"]:
                group_counts[classified["group"]] += 1
            else:
                invalid_count += 1
        
        # Sort by group, then by number
        results.sort(key=lambda x: (x["group"], str(x["number"]).zfill(10)))
        
        return {
            "results": results,
            "summary": {
                "total": len(results),
                "valid": len(results) - invalid_count,
                "invalid": invalid_count,
                "group_counts": group_counts
            }
        }
        
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File encoding error. Please use UTF-8.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/classify-prompts/download")
async def classify_prompts_download(file: UploadFile = File(...)):
    """
    Classify prompts and return as downloadable CSV.
    """
    result = await classify_prompts(file)
    
    # Generate CSV output
    output = io.StringIO()
    fieldnames = ['Group', 'Number', 'Variants', 'Prompt', 'Chest_Type', 'Cape', 'Arborist', 'Valid', 'Notes']
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    
    for item in result["results"]:
        writer.writerow({
            'Group': item['group'],
            'Number': item['number'],
            'Variants': item['variants'],
            'Prompt': item['prompt'],
            'Chest_Type': item['chest_type'],
            'Cape': item['cape'],
            'Arborist': item['arborist'],
            'Valid': 'Yes' if item['is_valid'] else 'No',
            'Notes': item['validation_notes']
        })
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=classified_prompts_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
    )



@router.get("/history")
async def get_jobs_history(limit: int = 50, offset: int = 0):
    """Get past generations from local DB"""
    return await get_history(limit, offset)

@router.get("/gallery")
async def get_gallery_view(
    sort_by: str = Query("created_at", description="Sort by: created_at, seed, batch_id, tag, prompt_number"),
    sort_order: str = Query("desc", description="Sort order: asc or desc"),
    tag: Optional[str] = Query(None, description="Filter by tag: accept, maybe, declined, untagged"),
    batch: Optional[str] = Query(None, description="Filter by batch_id"),
    imp: Optional[str] = Query(None, description="Filter by Important Variant (imp)"),
    limit: int = Query(100, description="Number of results"),
    offset: int = Query(0, description="Offset for pagination")
):
    """Get gallery view with sorting and filtering"""
    return await get_gallery(
        sort_by=sort_by,
        sort_order=sort_order,
        tag_filter=tag,
        batch_filter=batch,
        imp_filter=imp,
        limit=limit,
        offset=offset
    )

@router.patch("/generations/{generation_id}/tag")
async def set_generation_tag(generation_id: str, request: TagUpdateRequest):
    """Update the tag for a generation"""
    valid_tags = ["accept", "maybe", "declined", ""]
    if request.tag not in valid_tags:
        raise HTTPException(status_code=400, detail=f"Invalid tag. Must be one of: {valid_tags}")
    
    success = await update_tag(generation_id, request.tag)
    if not success:
        raise HTTPException(status_code=404, detail="Generation not found")
    
    return {"success": True, "generation_id": generation_id, "tag": request.tag}

@router.post("/enhance-prompts")
async def enhance_prompts(request: PromptEnhanceRequest):
    """
    Enhance prompts using OpenAI while preserving numbering and context.
    Returns original and enhanced prompts side by side.
    """
    import re
    
    enhanced_results = []
    
    # DETAILED SYSTEM PROMPT FOR PRIORITY-WEIGHTED ENHANCEMENT
    # Structure: Chest Emblem → Costume → Features/Props → Environment → Accents
    system_prompt = """# Image Prompt Enhancement Agent

## Objective
Enhance an existing image-generation prompt using a PRIORITY-WEIGHTED STRUCTURE. AI image generators weight early tokens more heavily, so the most important distinguishing features MUST appear first in the output.

**The enhancement process is additive, selective, and STRUCTURALLY ORDERED.**

---

## CRITICAL: Priority-Weighted Output Structure (SINGLE LINE)

The enhanced prompt MUST be output as ONE SINGLE LINE with NO paragraph breaks or newlines.
Organize the content in this priority order, flowing naturally as one continuous sentence/description:

**SECTION ORDER (all within one line):**

1. **DEFINING EMBLEM FIRST**: Start with the character's chest emblem or primary defining symbol. This is the MOST IMPORTANT visual element.
   
2. **COSTUME & PHYSIQUE SECOND**: Flow into body, costume design, mask, materials.

3. **FEATURES & PROPS THIRD**: Describe held objects, tools, signature items (chainsaw, globe, token, etc.). Maximum 2 items.

4. **ENVIRONMENT FOURTH**: Describe setting, background, ground elements.

5. **ACCENTS & COMPOSITION LAST**: End with controlled energy effects, aura, AND ALWAYS include composition/framing notes: "head-to-toe, full-body depiction, centered composition, square format, cinematic lighting."

**EXAMPLE OUTPUT (notice it's ONE continuous line):**

"A striking comic-book style superhero defined by a faceted crystal gem emblem at the center of his chest, glowing against a powerful physique formed from intertwined purple and green vines traced with refined gold accents. His costume is minimal and purposeful: a fitted lower-face mask, no cape, and a sleek, vine-woven body design that emphasizes strength and control. In one hand he holds a glowing holographic globe containing a miniature bonsai tree. He stands heroically within an enchanted forest, where ancient roots glow faintly beneath his feet and towering trees frame the scene. Glistening lightning energy arcs softly around his form as a controlled accent. Centered composition, head-to-toe, full-body depiction, square format, cinematic lighting."

⚠️ CRITICAL: Output must be ONE LINE with NO line breaks, NO paragraph separations. Just one continuous flowing prompt.

---

## Core Rules (Hard Constraints)

### 1. Chest Emblem Constraint (FIRST PRIORITY)
Allow only ONE chest detail - and it MUST be mentioned FIRST in the prompt.

Valid chest details include (choose at most one):
- Tree-of-life emblem
- Faceted crystal gem
- Five-pointed golden star
- Blue droplet-shaped S-curve emblem
- Bold text "SUI"
- Any unique emblem specified in the original prompt

❌ Never stack or combine chest emblems.
❌ Never replace the original chest emblem - this is the DEFINING feature.
✅ The chest emblem from the original prompt MUST be preserved and emphasized FIRST.
✅ Use weighted language: "defined by", "distinguished by", "marked by"

### 2. Feature / Prop Constraint
Allow a maximum of TWO enhancement feature points total.

Feature points include:
- Coins (any type)
- Cubes / boxes
- Spheres / orbs
- Digital vines
- Acorns / seedlings
- Staffs / tokens / disks

❌ Never exceed two feature points.
❌ Never assign more than one object per hand.

### 3. Accent Control Rule
When describing energy/aura effects (Paragraph 4):
- Always describe as "controlled", "soft", "subtle", "refined"
- Never describe as "chaotic", "explosive", "overwhelming"
- Effects should ENHANCE, not OVERPOWER the character
- Use phrases like: "acting as a controlled accent", "enhancing the sense of contained power"

### 4. Gear Consistency Rule
If the prompt references arborist gear, include helmet and harness.
If the prompt references a mask, do not add exposed facial features.

### 5. Composition Preservation Rule (MANDATORY)
ALWAYS include composition/framing notes at the END of the enhanced prompt:
- If the original mentions "full body", "head to toe", "centered", etc. - PRESERVE these exactly
- If the original doesn't specify, ADD: "Centered composition, head-to-toe, full-body depiction, square format, cinematic lighting."

❌ Never omit composition directives
✅ Composition notes MUST appear at the very end of the prompt

---

## Enhancement Selection Logic

### Match the theme of the original prompt:
- Cosmic → orb, nebula, energy veins
- Temple / forest → acorn, seedling, wooden cube, glowing roots
- Tech / chain → digital vines, metallic sphere

### Prefer reinforcing existing intent:
- Tokens → refined tokens (engraving, glow)
- Energy → controlled, refined, directional energy
- Vines → purposeful, structured, intentional motion

## Language & Style Guidelines

- Output must be ONE SINGLE LINE - no paragraph breaks or newlines
- Use natural sentence flow to transition between priority sections
- Add descriptive qualifiers: "striking", "defined by", "purposeful", "controlled", "refined", "glistening", "cinematic"
- Keep the chest emblem description vivid and at the START
- Features/Props should be described with detail and purpose
- Describe accents as contained/controlled, not chaotic

The final prompt should feel:
- **Priority-weighted** (most important features first)
- **One flowing sentence** (no line breaks)
- **Cinematic with clear visual hierarchy**
- **Less busy, more intentional**

---

## Final Validation Checklist (You Must Pass All)

Before outputting the enhanced prompt, verify:
☐ Output is ONE SINGLE LINE with NO line breaks or paragraph separations
☐ Chest emblem is mentioned FIRST in the prompt
☐ Priority order is maintained: Emblem → Costume → Features → Environment → Accents
☐ Only one chest emblem exists
☐ Features/Props from original prompt are preserved
☐ No more than two feature items total
☐ Accents described as controlled, not chaotic
☐ COMPOSITION NOTES included at the END (head-to-toe, full-body, centered, etc.)
☐ Original prompt's unique elements are preserved and emphasized

---

## Output Format
Return ONLY the enhanced prompt as ONE SINGLE CONTINUOUS LINE.
NO paragraph breaks. NO newlines. NO line separations.
Just one flowing prompt text with natural sentence transitions.
"""

    if request.style_phrases:
        system_prompt += f"""

---

## MANDATORY STYLE/CONTEXT REQUIREMENTS
The following elements MUST be incorporated into the enhanced prompt:

{request.style_phrases}

These are NOT optional. They define the core visual identity of this batch."""
    
    # Process each prompt
    for prompt_line in request.prompts:
        prompt_line = prompt_line.strip()
        if not prompt_line:
            continue
            
        # Extract prompt number if present - supports both [number] and plain number formats
        # First try [number] format
        number_match = re.match(r'^\[(\d+)\]\s*', prompt_line)
        if not number_match:
            # Also try plain number at start (e.g., "4991 prompt text")
            number_match = re.match(r'^(\d+)\s+', prompt_line)
        
        prompt_number = None
        clean_prompt = prompt_line
        
        if number_match:
            prompt_number = int(number_match.group(1))
            clean_prompt = prompt_line[len(number_match.group(0)):].strip()
        
        # Skip empty after number extraction
        if not clean_prompt:
            continue
        
        # Call OpenAI API
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {request.openai_api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": request.model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": f"Enhance this image prompt:\n\n{clean_prompt}"}
                        ],
                        "temperature": 0.7,
                        "max_completion_tokens": 300
                    }
                )
                
                if response.status_code != 200:
                    error_detail = response.json().get('error', {}).get('message', 'Unknown error')
                    enhanced_results.append({
                        "prompt_number": prompt_number,
                        "original": clean_prompt,
                        "enhanced": None,
                        "error": f"OpenAI API error: {error_detail}"
                    })
                    continue
                
                result = response.json()
                enhanced_text = result['choices'][0]['message']['content'].strip()
                
                # Format the enhanced prompt with number if it had one (no brackets for clean output)
                formatted_enhanced = f"{prompt_number} {enhanced_text}" if prompt_number else enhanced_text
                formatted_original = f"{prompt_number} {clean_prompt}" if prompt_number else clean_prompt
                
                # Save enhancement to database for export/tracking
                await save_prompt_enhancement(
                    prompt_number=prompt_number,
                    original=clean_prompt,
                    enhanced=enhanced_text,
                    style_phrases=request.style_phrases
                )
                
                enhanced_results.append({
                    "prompt_number": prompt_number,
                    "original": clean_prompt,
                    "enhanced": enhanced_text,
                    "formatted_original": formatted_original,
                    "formatted_enhanced": formatted_enhanced
                })
                
        except Exception as e:
            enhanced_results.append({
                "prompt_number": prompt_number,
                "original": clean_prompt,
                "enhanced": None,
                "error": str(e)
            })
        
        # Small delay to avoid rate limiting
        await asyncio.sleep(0.1)
    
    return {
        "results": enhanced_results,
        "total": len(enhanced_results),
        "successful": len([r for r in enhanced_results if r.get('enhanced')]),
        "failed": len([r for r in enhanced_results if r.get('error')])
    }


@router.get("/export")
async def export_generations(
    tag: Optional[str] = Query(None, description="Filter by tag: accept, maybe, declined, untagged"),
    batch: Optional[str] = Query(None, description="Filter by batch_id"),
    imp: Optional[str] = Query(None, description="Filter by Important Variant"),
    format: str = Query("zip", description="Export format: zip or csv")
):
    """Export generations with images and CSV index"""
    records = await export_gallery(tag_filter=tag, batch_filter=batch, imp_filter=imp)
    
    if not records:
        raise HTTPException(status_code=404, detail="No records found matching filters")
    
    # Enrich records with enhancement data if not already present
    for record in records:
        if record.get('prompt_number') and not record.get('enhanced_prompt'):
            enhancement = await get_enhancement_by_number(record['prompt_number'])
            if enhancement:
                record['original_prompt'] = enhancement.get('original_prompt')
                record['enhanced_prompt'] = enhancement.get('enhanced_prompt')
    
    # Create temp directory for export
    export_dir = tempfile.mkdtemp(prefix="leonardo_export_")
    
    # Generate CSV index
    csv_path = os.path.join(export_dir, "index.csv")
    generate_export_csv(records, csv_path)
    
    if format == "csv":
        # Just return the CSV
        return FileResponse(
            csv_path, 
            media_type='text/csv', 
            filename=f"leonardo_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        )
    
    # For ZIP: copy images and include CSV
    images_dir = os.path.join(export_dir, "images")
    os.makedirs(images_dir, exist_ok=True)
    
    for record in records:
        if record.get('local_path') and os.path.exists(record['local_path']):
            # Copy image with meaningful filename
            # Use prompt_number first, then fall back to parsed_number, then extract from prompt text
            prompt_num = record.get('prompt_number') or record.get('parsed_number')
            
            # If still not found, try to extract from prompt text (format: "3155\t..." or "3155 ...")
            if not prompt_num and record.get('prompt'):
                import re
                num_match = re.match(r'^(\d+)[\t\s]', record['prompt'])
                if num_match:
                    prompt_num = num_match.group(1)
            
            prompt_num = prompt_num or 'unknown'
            tag_str = record.get('tag') or 'untagged'
            seed = record.get('seed') or 'random'
            imp = record.get('imp')
            ext = os.path.splitext(record['local_path'])[1]
            
            # Construct filename: Number__imp=variant__tag_seed.ext
            new_name_parts = [str(prompt_num)]
            if imp:
                new_name_parts.append(f"imp={imp}")
            new_name_parts.append(f"{tag_str}_{seed}")
            
            new_name = f"{'__'.join(new_name_parts)}{ext}"
            shutil.copy2(record['local_path'], os.path.join(images_dir, new_name))
    
    # Create ZIP
    zip_base = os.path.join(export_dir, "export")
    shutil.make_archive(zip_base, 'zip', export_dir)
    zip_path = f"{zip_base}.zip"
    
    return FileResponse(
        zip_path,
        media_type='application/zip',
        filename=f"leonardo_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    )

# === User & Models ===

@router.get("/me", response_model=UserResponse)
async def get_user_info(apiKey: str):
    client = LeonardoClient(api_key=apiKey)
    try:
        data = await client.get_user_info()
        details = data['user_details'][0]
        api_credits = details.get('apiSubscriptionTokens', 0) or 0
        
        return {
            "id": details['user']['id'],
            "username": details['user']['username'],
            "subscriptionTokens": api_credits,
            "subscriptionGptTokens": details.get('subscriptionGptTokens', 0) or 0,
            "subscriptionModelTokens": details.get('subscriptionModelTokens', 0) or 0
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/me/raw")
async def get_user_info_raw(apiKey: str):
    """Debug endpoint to see raw API response"""
    client = LeonardoClient(api_key=apiKey)
    return await client.get_user_info()

@router.get("/models", response_model=List[ModelInfo])
async def list_models(apiKey: str):
    client = LeonardoClient(api_key=apiKey)
    try:
        data = await client.list_platform_models()
        models = []
        for m in data['custom_models']:
            models.append(ModelInfo(
                id=m['id'], 
                name=m['name'], 
                description=m.get('description'),
                generated_image=m.get('generated_image', {}).get('url') if m.get('generated_image') else None
            ))
        return models
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# === Generation ===

@router.post("/generate/batch")
async def submit_batch(request: BatchRequest):
    batch_id = str(uuid.uuid4())[:8]
    job_ids = []
    
    print("=" * 60)
    print(f"[DEBUG] Received batch request with {len(request.items)} items")
    for idx, item in enumerate(request.items):
        item_data = item.model_dump()
        print(f"[DEBUG] Item {idx+1}: prompt_number={item_data.get('prompt_number')}, modelId={item_data.get('modelId')}")
    print("=" * 60)
    
    for idx, item in enumerate(request.items):
        payload = {
            "apiKey": request.apiKey,
            "prompt_data": item.model_dump(),
            "batch_id": batch_id,
            "prompt_index": idx + 1
        }
        job_id = await queue_manager.submit_job("generation", payload)
        job_ids.append(job_id)
        
    return {"batchId": batch_id, "jobIds": job_ids, "message": f"Queued {len(job_ids)} jobs"}

@router.post("/generations/sync")
async def sync_generations(
    apiKey: str = Body(..., embed=True), 
    limit: int = Body(1000, embed=True),
    filter_project_prompts: bool = Body(True, embed=True)
):
    """
    Fetch recent generations from Leonardo and save to local DB.
    - limit: Max number of generations to fetch (default 1000)
    - filter_project_prompts: If True, only imports generations that look like they came from this App (start with a number).
      The Leonardo API does not currently allow filtering by Source/API Key, so this is necessary to distinguish specific App generations.
    """
    try:
        from datetime import datetime
        
        client = LeonardoClient(api_key=apiKey)
        
        # 1. Get User ID
        user_info = await client.get_user_info()
        user_details = user_info.get('user_details', [])
        if not user_details:
            raise HTTPException(status_code=400, detail="Could not fetch user details")
        user_id = user_details[0]['user']['id']
        
        # CRITICAL FIX: Separate import limit from scan limit
        # limit: How many items we want to SAVE to our DB (e.g. 1000)
        # scan_limit: How far back we check before giving up (safety brake, e.g. 5000)
        target_import_count = limit
        max_scan_depth = 5000 
        
        synced_count = 0
        scanned_count = 0
        skipped_count = 0
        offset = 0
        batch_size = 50 
        
        print(f"[SYNC] Starting sync for user {user_id}. Target Import: {target_import_count}. Max Scan: {max_scan_depth}. Filtering: {filter_project_prompts}")
        
        while synced_count < target_import_count and scanned_count < max_scan_depth:
            # Always fetch full batches to maximize scanning speed
            current_batch_limit = batch_size
                
            resp = await client.get_user_generations(user_id, offset=offset, limit=current_batch_limit)
            generations = resp.get('generations', [])
            
            if not generations:
                print("[SYNC] No more generations returned from API.")
                break
            
            batch_synced = 0
            
            for gen in generations:
                scanned_count += 1
                if gen.get('status') != 'COMPLETE': 
                    continue
                
                # Basic data extraction
                prompt = gen.get('prompt') or ""
                
                # --- FILTER LOGIC ---
                if filter_project_prompts:
                    # Regex: Look for digits at start (123...) or inside brackets ([123]...)
                    clean_prompt = prompt.strip()
                    if not re.search(r'^\[?\d+', clean_prompt):
                         skipped_count += 1
                         continue
                
                width = gen.get('imageWidth')
                height = gen.get('imageHeight')
                model_id = gen.get('modelId')
                gen_seed = gen.get('seed')
                created_str = gen.get('createdAt')
                gen_id = gen.get('id')
                
                for img in gen.get('generated_images', []):
                    try:
                        # Data mapping
                        data = {
                            "generationId": img['id'], 
                            "batch_id": gen_id,
                            "prompt": prompt,
                            "prompt_number": None,
                            "modelId": model_id,
                            "status": "COMPLETE",
                            "image_url": img['url'],
                            "local_path": "", 
                            "width": width,
                            "height": height,
                            "seed": img.get('seed') or gen_seed,
                            "tag": None,
                            "guidance_scale": gen.get('guidanceScale'),
                            "num_steps": gen.get('inferenceSteps'),
                            "preset_style": gen.get('presetStyle'),
                            "imp": None,
                            "created_at": created_str
                        }
                        
                        # Try to parse number from prompt for metadata (optional)
                        number_match = re.match(r'^\[?(\d+)\]?', prompt.strip())
                        if number_match:
                            data['prompt_number'] = int(number_match.group(1))
                        
                        # Insert
                        await insert_generation(data)
                        synced_count += 1
                        batch_synced += 1
                        
                        # Stop if we hit the target mid-batch
                        if synced_count >= target_import_count:
                            break
                            
                    except Exception as img_e:
                        print(f"[SYNC ERROR] Failed to import image {img.get('id')}: {img_e}")
                        continue
                
                if synced_count >= target_import_count:
                    break
            
            offset += len(generations)
            print(f"[SYNC] Batch done. Offset: {offset}, Total Scanned: {scanned_count}, Total Synced: {synced_count}, Skipped: {skipped_count}")
            
            # Reduce sleep slightly to speed up deep scanning
            await asyncio.sleep(0.1)
                
        return {
            "success": True, 
            "count": synced_count, 
            "scanned": scanned_count, 
            "skipped": skipped_count
        }
        
    except Exception as e:
        print(f"Sync error: {e}")
        # Print full traceback for debugging
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/jobs/{batch_id}")
async def get_batch_status(batch_id: str):
    all_jobs = queue_manager.list_jobs()
    batch_jobs = [j for j in all_jobs if j.payload.get("batch_id") == batch_id]
    
    return {
        "batchId": batch_id,
        "total": len(batch_jobs),
        "completed": len([j for j in batch_jobs if j.status == JobStatus.COMPLETED]),
        "failed": len([j for j in batch_jobs if j.status == JobStatus.FAILED]),
        "processing": len([j for j in batch_jobs if j.status == JobStatus.PROCESSING]),
        "queued": len([j for j in batch_jobs if j.status == JobStatus.QUEUED]),
        "jobs": [
            {
                "id": j.id, 
                "status": j.status, 
                "result": j.result, 
                "error": j.error,
                "prompt": j.payload['prompt_data']['prompt'],
                "prompt_number": j.payload['prompt_data'].get('prompt_number')
            } for j in batch_jobs
        ]
    }

@router.post("/upload/init-image")
async def upload_init_image(apiKey: str = Form(...), file: UploadFile = File(...)):
    temp_path = f"temp_{file.filename}"
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    try:
        client = LeonardoClient(api_key=apiKey)
        ext = file.filename.split('.')[-1]
        image_id = await client.upload_init_image(temp_path, ext)
        os.remove(temp_path)
        return {"imageId": image_id}
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/jobs/{batch_id}/zip")
async def download_batch_zip(batch_id: str):
    found_dir = None
    for root, dirs, files in os.walk(settings.OUTPUT_DIR):
        if f"batch_{batch_id}" in dirs:
            found_dir = os.path.join(root, f"batch_{batch_id}")
            break
            
    if not found_dir:
        raise HTTPException(status_code=404, detail="Batch output not found")

    shutil.make_archive(found_dir, 'zip', found_dir)
    zip_path = f"{found_dir}.zip"
    
    return FileResponse(zip_path, media_type='application/zip', filename=f"batch_{batch_id}.zip")
