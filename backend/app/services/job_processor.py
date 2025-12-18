import asyncio
import logging
from app.services.leonardo_client import LeonardoClient
from app.services.storage import storage_service
from app.services.queue_manager import Job
from typing import Dict, Any

from app.services.db import insert_generation

logger = logging.getLogger(__name__)

async def process_generation_job(job: Job) -> Dict[str, Any]:
    """
    Handles the full lifecycle of a single generation request:
    1. Submit to Leonardo
    2. Poll for completion
    3. Download images
    4. Save results
    """
    payload = job.payload
    api_key = payload.get("apiKey")
    prompt_data = payload.get("prompt_data")
    batch_id = payload.get("batch_id")
    prompt_index = payload.get("prompt_index", 0)
    
    # Debug logging - log what the frontend is sending us
    import json
    import datetime
    model_id = prompt_data.get("modelId")
    with open('frontend_payload_log.txt', 'a') as f:
        f.write(f"\n{'='*60}\n")
        f.write(f"[{datetime.datetime.now().isoformat()}] Frontend Payload Received:\n")
        f.write(json.dumps(prompt_data, indent=2, default=str))
        f.write(f"\n{'='*60}\n")
    
    logger.info(f"Processing job {job.id} with model: {model_id}")
    logger.info(f"Prompt: {prompt_data.get('prompt')[:50]}...")
    logger.info(f"init_image_ids from frontend: {prompt_data.get('init_image_ids')}")
    logger.info(f"init_image_id from frontend: {prompt_data.get('init_image_id')}")
    
    client = LeonardoClient(api_key=api_key)
    
    # 1. Submit
    # Leonardo API expects "init_image_id" and "init_strength" in the payload
    # But our Client.create_generation takes **kwargs and passes them directly.
    # We need to ensure we map correctly.
    
    submit_kwargs = {
        "negative_prompt": prompt_data.get("negative_prompt"),
        "width": prompt_data.get("width"),
        "height": prompt_data.get("height"),
        "num_images": prompt_data.get("num_images", 1),
        "seed": prompt_data.get("seed"),
    }

    # Flux model detection - different Flux models have different capabilities
    # Kontext: supports styles, better image guidance
    # Dev/Schnell: more limited, no alchemy/styles
    FLUX_KONTEXT_ID = "28aeddf8-bd19-4803-80fc-79602d1a9989"
    FLUX_DEV_ID = "b2614463-296c-462a-9586-aafdb8f00e36"
    FLUX_SCHNELL_ID = "1dd50843-d653-4516-a8e3-f0238ee453ff"
    
    is_flux_kontext = model_id == FLUX_KONTEXT_ID or "kontext" in model_id.lower()
    is_flux_dev_or_schnell = model_id in [FLUX_DEV_ID, FLUX_SCHNELL_ID] or (
        "flux" in model_id.lower() and not is_flux_kontext
    )
    is_flux_model = is_flux_kontext or is_flux_dev_or_schnell
    
    print(f"[DEBUG] Model: {model_id}")
    print(f"[DEBUG] is_flux_kontext: {is_flux_kontext}, is_flux_dev_or_schnell: {is_flux_dev_or_schnell}")
    
    # Handle multiple image references (combined mode)
    if prompt_data.get("init_image_ids") and len(prompt_data.get("init_image_ids", [])) > 0:
        init_image_ids = prompt_data.get("init_image_ids")
        strength = prompt_data.get("strength", 0.7)
        reference_mode = prompt_data.get("reference_mode", "character")
        
        print(f"[DEBUG] Multiple reference images mode: {len(init_image_ids)} images")
        
        if is_flux_dev_or_schnell:
            # Flux Dev/Schnell only supports single basic image reference
            # Use the first image
            submit_kwargs["init_image_id"] = init_image_ids[0]
            submit_kwargs["init_strength"] = strength
            print(f"[DEBUG] Flux Dev/Schnell - using only first image in basic mode")
        elif is_flux_kontext:
            # Flux Kontext uses contextImages parameter, NOT controlnets!
            # Format: array of {type: "UPLOADED", id: imageId}
            context_images = []
            for idx, img_id in enumerate(init_image_ids):
                context_images.append({
                    "type": "UPLOADED",
                    "id": img_id
                })
                print(f"[DEBUG] ContextImage {idx+1}: id={img_id}")
            
            submit_kwargs["contextImages"] = context_images
            print(f"[DEBUG] Flux Kontext - using {len(context_images)} contextImages")
        else:
            # Non-Flux models use controlnets
            preprocessor_ids = {
                "character": 133,
                "style": 134,
                "content": 135
            }
            preprocessor_id = preprocessor_ids.get(reference_mode, 133)
            
            if strength >= 0.7:
                strength_type = "High"
            elif strength >= 0.4:
                strength_type = "Mid"
            else:
                strength_type = "Low"
            
            # Create a controlnet entry for EACH reference image
            controlnets = []
            for idx, img_id in enumerate(init_image_ids):
                # Calculate influence for multiple images (distribute evenly)
                influence = 1.0 / len(init_image_ids) if len(init_image_ids) > 1 else 1.0
                
                controlnets.append({
                    "initImageId": img_id,
                    "initImageType": "UPLOADED",
                    "preprocessorId": preprocessor_id,
                    "strengthType": strength_type,
                    "weight": min(strength * 2, 2.0),
                    "influence": influence
                })
                print(f"[DEBUG] ControlNet {idx+1}: imageId={img_id}, influence={influence:.2f}")
            
            submit_kwargs["controlnets"] = controlnets
            print(f"[DEBUG] Using {len(controlnets)} {reference_mode.upper()} Reference ControlNets")
    
    # Handle single image reference (legacy/fallback)
    elif prompt_data.get("init_image_id"):
        init_image_id = prompt_data.get("init_image_id")
        strength = prompt_data.get("strength", 0.7)
        reference_mode = prompt_data.get("reference_mode", "character")
        
        # Flux Dev/Schnell doesn't support ControlNet - use basic mode
        if is_flux_dev_or_schnell or reference_mode == "basic":
            # Basic image-to-image mode
            submit_kwargs["init_image_id"] = init_image_id
            submit_kwargs["init_strength"] = strength
            if is_flux_dev_or_schnell and reference_mode != "basic":
                print(f"[DEBUG] Flux Dev/Schnell detected - forcing BASIC image-to-image mode (ControlNet not supported)")
            print(f"[DEBUG] Using BASIC image-to-image mode:")
            print(f"  - init_image_id: {init_image_id}")
            print(f"  - init_strength: {strength}")
        elif is_flux_kontext:
            # Flux Kontext uses contextImages parameter
            submit_kwargs["contextImages"] = [{
                "type": "UPLOADED",
                "id": init_image_id
            }]
            print(f"[DEBUG] Flux Kontext - using single contextImage: {init_image_id}")
        else:
            # Use ControlNet for Character/Style/Content Reference (non-Flux models)
            # preprocessorId: 133 = Character, 134 = Style, 135 = Content
            preprocessor_ids = {
                "character": 133,
                "style": 134,
                "content": 135
            }
            preprocessor_id = preprocessor_ids.get(reference_mode, 133)
            
            # Map strength to strengthType: Low (0.1-0.4), Mid (0.4-0.7), High (0.7-1.0)
            if strength >= 0.7:
                strength_type = "High"
            elif strength >= 0.4:
                strength_type = "Mid"
            else:
                strength_type = "Low"
            
            # Use controlnets array
            submit_kwargs["controlnets"] = [{
                "initImageId": init_image_id,
                "initImageType": "UPLOADED",
                "preprocessorId": preprocessor_id,
                "strengthType": strength_type,
                "weight": min(strength * 2, 2.0)  # Scale weight (0-2 range)
            }]
            
            print(f"[DEBUG] Using {reference_mode.upper()} Reference ControlNet:")
            print(f"  - preprocessorId: {preprocessor_id}")
            print(f"  - initImageId: {init_image_id}")
            print(f"  - strengthType: {strength_type}")
            print(f"  - weight: {min(strength * 2, 2.0)}")

    # User Element/LoRA support - Leonardo uses "userElements" with "userLoraId" (numeric)
    if prompt_data.get("userElements"):
        submit_kwargs["userElements"] = prompt_data.get("userElements")
    elif prompt_data.get("elements"):
        # Convert elements format to userElements format
        elements = prompt_data.get("elements")
        submit_kwargs["userElements"] = [
            {"userLoraId": int(el.get("userLoraId", el.get("akUUID", el.get("id")))), "weight": el.get("weight", 1.0)}
            for el in elements
        ]
    elif prompt_data.get("loras"):
        # Convert from old loras format to userElements format
        loras = prompt_data.get("loras")
        submit_kwargs["userElements"] = [
            {"userLoraId": int(lora.get("id", lora.get("userLoraId"))), "weight": lora.get("weight", 1.0)}
            for lora in loras
        ]

    # Advanced settings
    # Flux Kontext DOES support guidance_scale (recommended: 7) and num_inference_steps (10-60)
    # Only Flux Dev/Schnell should skip these parameters
    if not is_flux_dev_or_schnell:
        if prompt_data.get("guidance_scale"):
            submit_kwargs["guidance_scale"] = prompt_data.get("guidance_scale")
        if prompt_data.get("num_inference_steps"):
            submit_kwargs["num_inference_steps"] = prompt_data.get("num_inference_steps")
        # Scheduler may not be relevant for Flux Kontext, but shouldn't hurt to send
        if not is_flux_kontext and prompt_data.get("scheduler"):
            submit_kwargs["scheduler"] = prompt_data.get("scheduler")
    else:
        print(f"[DEBUG] Skipping guidance_scale/num_inference_steps for Flux Dev/Schnell")
    
    # Flux Kontext supports presetStyle, but Flux Dev/Schnell don't support alchemy or presetStyle
    if is_flux_dev_or_schnell:
        print(f"[DEBUG] Skipping alchemy/presetStyle for Flux Dev/Schnell: {model_id}")
    else:
        # Non-Flux models and Flux Kontext can use presetStyle
        if prompt_data.get("presetStyle"):
            submit_kwargs["presetStyle"] = prompt_data.get("presetStyle")
        # Alchemy is only for non-Flux models
        if not is_flux_model and prompt_data.get("alchemy"):
            submit_kwargs["alchemy"] = prompt_data.get("alchemy")
    
    if prompt_data.get("enhancePrompt"):
        submit_kwargs["enhancePrompt"] = prompt_data.get("enhancePrompt")

    create_resp = await client.create_generation(
        prompt=prompt_data["prompt"],
        model_id=prompt_data["modelId"],
        **submit_kwargs
    )
    
    generation_id = create_resp['sdGenerationJob']['generationId']
    logger.info(f"Submitted generation {generation_id} for job {job.id}")
    
    # 2. Poll
    # Leonardo generations usually take 10-60s
    attempts = 0
    max_attempts = 60
    final_data = None
    
    while attempts < max_attempts:
        await asyncio.sleep(2)
        gen_info = await client.get_generation(generation_id)
        status = gen_info['generations_by_pk']['status']
        
        if status == 'COMPLETE':
            final_data = gen_info['generations_by_pk']
            break
        elif status == 'FAILED':
            raise Exception("Generation failed on Leonardo side")
        
        attempts += 1
    
    if not final_data:
        raise Exception("Timeout waiting for generation")
    
    # 3. Download & Save
    saved_images = []
    generated_images = final_data.get('generated_images', [])
    
    # Debug: Log seed sources
    print(f"[DEBUG] Seed from final_data (generation level): {final_data.get('seed')}")
    print(f"[DEBUG] Seed from prompt_data (user request): {prompt_data.get('seed')}")
    
    for idx, img_obj in enumerate(generated_images):
        url = img_obj['url']
        local_path = await storage_service.save_image(url, batch_id, prompt_index, idx + 1)
        saved_images.append(local_path)
        
        # 4. Save to DB and CSV
        data_packet = {
            "prompt": prompt_data["prompt"],
            "prompt_number": prompt_data.get("prompt_number"),  # Track prompt number from bulk batch
            "original_prompt": prompt_data.get("original_prompt"),  # Original before enhancement
            "enhanced_prompt": prompt_data.get("enhanced_prompt"),  # AI-enhanced version
            "modelId": prompt_data["modelId"],
            "width": prompt_data.get("width"),
            "height": prompt_data.get("height"),
            # Seed priority: generation-level (final_data.seed) > image-level (img_obj.seed) > user-requested
            "seed": final_data.get("seed") or img_obj.get("seed") or prompt_data.get("seed"),
            "generationId": generation_id,
            "image_url": url,
            "local_path": local_path,
            "status": "COMPLETE",
            "timestamp": job.updated_at.isoformat(),
            "batch_id": batch_id,
            # Additional metadata for gallery/export
            "guidance_scale": prompt_data.get("guidance_scale"),
            "num_steps": prompt_data.get("num_inference_steps"),
            "preset_style": prompt_data.get("presetStyle"),
            "tag": None  # Will be set later via UI
        }
        await storage_service.append_to_csv(batch_id, data_packet)
        try:
             insert_generation(data_packet)
        except Exception as e:
             logger.error(f"Failed to insert into DB: {e}")

    return {
        "generationId": generation_id,
        "images": saved_images,
        "original_data": final_data
    }
