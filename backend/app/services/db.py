import sqlite3
import os
import csv
from datetime import datetime
from app.core.config import settings
from dataclasses import dataclass
from typing import Optional, List, Dict, Any

DB_PATH = os.path.join(settings.OUTPUT_DIR, "history.db")

def init_db():
    """Initialize database with all required columns"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Create base table if not exists
    c.execute('''
        CREATE TABLE IF NOT EXISTS generations (
            id TEXT PRIMARY KEY,
            batch_id TEXT,
            prompt TEXT,
            prompt_number INTEGER,
            model_id TEXT,
            status TEXT,
            image_url TEXT,
            local_path TEXT,
            width INTEGER,
            height INTEGER,
            seed INTEGER,
            tag TEXT,
            guidance_scale INTEGER,
            num_steps INTEGER,
            preset_style TEXT,
            created_at TIMESTAMP
        )
    ''')
    
    # Add new columns if they don't exist (for migration)
    try:
        c.execute('ALTER TABLE generations ADD COLUMN prompt_number INTEGER')
    except sqlite3.OperationalError:
        pass  # Column already exists
    
    try:
        c.execute('ALTER TABLE generations ADD COLUMN tag TEXT')
    except sqlite3.OperationalError:
        pass
    
    try:
        c.execute('ALTER TABLE generations ADD COLUMN guidance_scale INTEGER')
    except sqlite3.OperationalError:
        pass
    
    try:
        c.execute('ALTER TABLE generations ADD COLUMN num_steps INTEGER')
    except sqlite3.OperationalError:
        pass
    
    try:
        c.execute('ALTER TABLE generations ADD COLUMN preset_style TEXT')
    except sqlite3.OperationalError:
        pass
    
    # Track original vs enhanced prompts
    try:
        c.execute('ALTER TABLE generations ADD COLUMN original_prompt TEXT')
    except sqlite3.OperationalError:
        pass
    
    try:
        c.execute('ALTER TABLE generations ADD COLUMN enhanced_prompt TEXT')
    except sqlite3.OperationalError:
        pass
    
    # Create prompt_enhancements table to store enhancement sessions
    c.execute('''
        CREATE TABLE IF NOT EXISTS prompt_enhancements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prompt_number INTEGER,
            original_prompt TEXT,
            enhanced_prompt TEXT,
            style_phrases TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()

def insert_generation(data: dict):
    """Insert a new generation record"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        INSERT INTO generations (
            id, batch_id, prompt, prompt_number, model_id, status, image_url, local_path, 
            width, height, seed, tag, guidance_scale, num_steps, preset_style, 
            original_prompt, enhanced_prompt, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        data.get('generationId'),
        data.get('batch_id'),
        data.get('prompt'),  # The actual prompt used for generation
        data.get('prompt_number'),
        data.get('modelId'),
        data.get('status'),
        data.get('image_url'),
        data.get('local_path'),
        data.get('width'),
        data.get('height'),
        data.get('seed'),
        data.get('tag'),  # Initially null
        data.get('guidance_scale'),
        data.get('num_steps'),
        data.get('preset_style'),
        data.get('original_prompt'),  # Original user-uploaded prompt
        data.get('enhanced_prompt'),  # AI-enhanced version
        datetime.now().isoformat()
    ))
    conn.commit()
    conn.close()

def update_tag(generation_id: str, tag: str) -> bool:
    """Update the tag for a generation (accept/maybe/declined)"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('UPDATE generations SET tag = ? WHERE id = ?', (tag, generation_id))
    updated = c.rowcount > 0
    conn.commit()
    conn.close()
    return updated

def save_prompt_enhancement(prompt_number: Optional[int], original: str, enhanced: str, style_phrases: Optional[str] = None):
    """Save a prompt enhancement record"""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        INSERT INTO prompt_enhancements (prompt_number, original_prompt, enhanced_prompt, style_phrases)
        VALUES (?, ?, ?, ?)
    ''', (prompt_number, original, enhanced, style_phrases))
    conn.commit()
    conn.close()

def get_latest_enhancements(limit: int = 100) -> List[Dict[str, Any]]:
    """Get most recent prompt enhancements"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute('''
        SELECT * FROM prompt_enhancements 
        ORDER BY created_at DESC 
        LIMIT ?
    ''', (limit,))
    rows = c.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_enhancement_by_number(prompt_number: int) -> Optional[Dict[str, Any]]:
    """Get the most recent enhancement for a given prompt number"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute('''
        SELECT * FROM prompt_enhancements 
        WHERE prompt_number = ?
        ORDER BY created_at DESC 
        LIMIT 1
    ''', (prompt_number,))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None

def get_history(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    """Get generation history ordered by created_at DESC"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute('''
        SELECT * FROM generations 
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
    ''', (limit, offset))
    rows = c.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_gallery(
    sort_by: str = 'created_at',
    sort_order: str = 'desc',
    tag_filter: Optional[str] = None,
    batch_filter: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
) -> Dict[str, Any]:
    """Get gallery view with sorting and filtering"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    
    # Build query with filters
    query = 'SELECT * FROM generations WHERE 1=1'
    params = []
    
    if tag_filter:
        if tag_filter == 'untagged':
            query += ' AND (tag IS NULL OR tag = "")'
        else:
            query += ' AND tag = ?'
            params.append(tag_filter)
    
    if batch_filter:
        query += ' AND batch_id = ?'
        params.append(batch_filter)
    
    # Validate sort_by to prevent SQL injection
    valid_sorts = ['created_at', 'seed', 'batch_id', 'tag', 'prompt_number']
    if sort_by not in valid_sorts:
        sort_by = 'created_at'
    
    sort_direction = 'DESC' if sort_order.lower() == 'desc' else 'ASC'
    query += f' ORDER BY {sort_by} {sort_direction}'
    query += ' LIMIT ? OFFSET ?'
    params.extend([limit, offset])
    
    c.execute(query, params)
    rows = c.fetchall()
    
    # Get total count for pagination
    count_query = 'SELECT COUNT(*) FROM generations WHERE 1=1'
    count_params = []
    if tag_filter:
        if tag_filter == 'untagged':
            count_query += ' AND (tag IS NULL OR tag = "")'
        else:
            count_query += ' AND tag = ?'
            count_params.append(tag_filter)
    if batch_filter:
        count_query += ' AND batch_id = ?'
        count_params.append(batch_filter)
    
    c.execute(count_query, count_params)
    total = c.fetchone()[0]
    
    # Get unique batches for filter dropdown
    c.execute('SELECT DISTINCT batch_id FROM generations ORDER BY created_at DESC')
    batches = [row[0] for row in c.fetchall()]
    
    # Get tag counts
    c.execute('''
        SELECT tag, COUNT(*) as count FROM generations 
        GROUP BY tag
    ''')
    tag_counts = {row[0] or 'untagged': row[1] for row in c.fetchall()}
    
    conn.close()
    
    return {
        'items': [dict(row) for row in rows],
        'total': total,
        'batches': batches,
        'tag_counts': tag_counts
    }

def export_gallery(
    tag_filter: Optional[str] = None,
    batch_filter: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Export all matching records for CSV generation"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    
    query = 'SELECT * FROM generations WHERE 1=1'
    params = []
    
    if tag_filter:
        if tag_filter == 'untagged':
            query += ' AND (tag IS NULL OR tag = "")'
        else:
            query += ' AND tag = ?'
            params.append(tag_filter)
    
    if batch_filter:
        query += ' AND batch_id = ?'
        params.append(batch_filter)
    
    query += ' ORDER BY prompt_number ASC, created_at DESC'
    
    c.execute(query, params)
    rows = c.fetchall()
    conn.close()
    
    return [dict(row) for row in rows]

def generate_export_csv(records: List[Dict[str, Any]], output_path: str) -> str:
    """Generate a CSV file from records with proper formatting"""
    if not records:
        return None
    
    # Column order optimized for readability:
    # Number, Original Prompt, Number (duplicate for convenience), Enhanced Prompt, Tag, Seed, etc.
    fieldnames = [
        'prompt_number',         # A - Number
        'original_prompt',       # B - Original Prompt (if available)
        'prompt',                # C - Actual prompt used
        'enhanced_prompt',       # D - Enhanced Prompt (if available)
        'tag',                   # E - Tag (accept/maybe/declined)
        'seed',                  # F - Seed
        'batch_id',              # G - Batch ID
        'model_id',              # H - Model
        'width',                 # I - Width
        'height',                # J - Height
        'guidance_scale',        # K - Guidance Scale
        'num_steps',             # L - Steps
        'preset_style',          # M - Style Preset
        'export_filename',       # N - Filename in export ZIP
        'image_url',             # O - URL
        'local_path',            # P - Local path
        'created_at',            # Q - Created date
        'id'                     # R - Generation ID
    ]
    
    # Add export_filename to each record
    for record in records:
        prompt_num = record.get('prompt_number') or 'unknown'
        tag_str = record.get('tag') or 'untagged'
        seed = record.get('seed') or 'random'
        if record.get('local_path'):
            ext = os.path.splitext(record['local_path'])[1]
            record['export_filename'] = f"{prompt_num}_{tag_str}_{seed}{ext}"
        else:
            record['export_filename'] = ''
    
    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(records)
    
    return output_path
