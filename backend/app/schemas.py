from pydantic import BaseModel
from typing import List, Optional, Any

class ModelInfo(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    generated_image: Optional[str] = None

class LoraConfig(BaseModel):
    id: str
    weight: float = 0.8

class GenerationRequest(BaseModel):
    prompt: str  # The actual prompt to use for generation
    modelId: str
    prompt_number: Optional[int] = None  # For tracking prompts in bulk batches (e.g., 1-5000)
    original_prompt: Optional[str] = None  # Original user-uploaded prompt before enhancement
    enhanced_prompt: Optional[str] = None  # AI-enhanced version of the prompt
    negative_prompt: Optional[str] = None
    width: int = 1024
    height: int = 1024
    num_images: int = 1
    seed: Optional[int] = None
    scheduler: Optional[str] = None
    presetStyle: Optional[str] = None
    init_image_id: Optional[str] = None
    init_image_ids: Optional[List[str]] = None  # For combined mode with multiple reference images
    strength: Optional[float] = None
    reference_mode: Optional[str] = "character"  # "character", "style", "content", or "basic"
    loras: Optional[List[LoraConfig]] = None
    # Advanced settings
    guidance_scale: Optional[int] = None
    num_inference_steps: Optional[int] = None
    alchemy: Optional[bool] = None
    enhancePrompt: Optional[bool] = None

class BatchRequest(BaseModel):
    items: List[GenerationRequest]
    apiKey: Optional[str] = None
    
class JobResponse(BaseModel):
    id: str
    status: str
    result: Optional[Any] = None
    error: Optional[str] = None
    progress: Optional[float] = 0.0

class UserResponse(BaseModel):
    id: str
    username: str
    subscriptionTokens: int
    subscriptionGptTokens: int
    subscriptionModelTokens: int
