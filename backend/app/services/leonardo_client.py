import httpx
from typing import Optional, Dict, List, Any
from app.core.config import settings
import asyncio
import json

class LeonardoClient:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.LEONARDO_API_KEY
        self.base_url = settings.LEONARDO_API_URL
        self.headers = {
            "accept": "application/json",
            "content-type": "application/json",
            "authorization": f"Bearer {self.api_key}"
        }

    async def _request(self, method: str, endpoint: str, data: Optional[Dict] = None, params: Optional[Dict] = None):
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                method, 
                f"{self.base_url}{endpoint}", 
                headers=self.headers, 
                json=data, 
                params=params
            )
            try:
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                print(f"Error {method} {endpoint}: {e.response.text}")
                raise e

    async def get_user_info(self):
        return await self._request("GET", "/me")

    async def list_platform_models(self):
        return await self._request("GET", "/platformModels")

    async def get_user_generations(self, user_id: str, offset: int = 0, limit: int = 20):
        return await self._request("GET", f"/generations/user/{user_id}", params={"offset": offset, "limit": limit})

    async def create_generation(self, prompt: str, model_id: str, **kwargs):
        """
        kwargs can include: negative_prompt, num_images, width, height, guidance_scale, 
        scheduler, seed, public, promptMagic, etc.
        """
        payload = {
            "prompt": prompt,
            "modelId": model_id,
            **kwargs
        }
        # Debug: Log the FULL payload to a file for inspection
        import json
        import datetime
        with open('api_payload_log.txt', 'a') as f:
            f.write(f"\n{'='*60}\n")
            f.write(f"[{datetime.datetime.now().isoformat()}] Leonardo API Request:\n")
            f.write(json.dumps(payload, indent=2, default=str))
            f.write(f"\n{'='*60}\n")
        
        print("=" * 60)
        print("[DEBUG] FULL Leonardo API Request Payload:")
        print(json.dumps(payload, indent=2, default=str))
        print("=" * 60)
        return await self._request("POST", "/generations", data=payload)

    async def get_generation(self, generation_id: str):
        return await self._request("GET", f"/generations/{generation_id}")

    async def upload_init_image(self, file_path: str, extension: str = "png"):
        """
        Uploads a local file to Leonardo for use as init image.
        1. POST /init-image to get presigned URL
        2. PUT file to presigned URL
        3. Return the image ID
        """
        # 1. Get presigned URL
        init_response = await self._request("POST", "/init-image", data={"extension": extension})
        upload_fields = init_response.get("uploadInitImage")
        if not upload_fields:
            raise ValueError("Failed to get upload fields")
        
        fields = json.loads(upload_fields.get("fields", "{}"))
        url = upload_fields.get("url")
        image_id = upload_fields.get("id")

        # 2. Upload file
        # Note: This is a direct S3 upload, so we don't use the Leonardo headers
        async with httpx.AsyncClient(timeout=60.0) as client:
            with open(file_path, "rb") as f:
                # Construct form data for S3
                # S3 expects fields first, then file
                files = {'file': (f"image.{extension}", f)}
                # We need to merge fields and file
                response = await client.post(url, data=fields, files=files)
                response.raise_for_status()
        
        return image_id

    async def get_dataset_upload_presigned(self, extension: str = "png"):
        # For training custom models, not needed for reference image flow?
        # The user mentioned "reference image flow". Usually init-image is enough.
        pass
