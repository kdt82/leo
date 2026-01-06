import os
import csv
import aiofiles
import httpx
from datetime import datetime
from app.core.config import settings

class StorageService:
    def __init__(self):
        self.base_dir = settings.OUTPUT_DIR

    def _get_batch_dir(self, batch_id: str):
        date_str = datetime.now().strftime("%Y-%m-%d")
        return os.path.join(self.base_dir, date_str, f"batch_{batch_id}")

    async def save_image(self, url: str, batch_id: str, prompt_index: int, image_index: int, custom_filename: str = None) -> str:
        """Downloads and saves an image, returns local path."""
        batch_dir = self._get_batch_dir(batch_id)
        prompt_dir = os.path.join(batch_dir, f"p_{prompt_index}")
        os.makedirs(prompt_dir, exist_ok=True)
        
        if custom_filename:
            # Ensure safe filename
            safe_name = "".join([c for c in custom_filename if c.isalnum() or c in (' ', '-', '_', '.')]).rstrip()
            filename = f"{safe_name}.png"
        else:
            filename = f"image_{image_index:02d}.png"
            
        filepath = os.path.join(prompt_dir, filename)

        async with httpx.AsyncClient() as client:
            resp = await client.get(url)
            resp.raise_for_status()
            async with aiofiles.open(filepath, "wb") as f:
                await f.write(resp.content)
        
        return filepath

    async def append_to_csv(self, batch_id: str, data: dict):
        """Appends a row to results.csv in the batch directory."""
        batch_dir = self._get_batch_dir(batch_id)
        os.makedirs(batch_dir, exist_ok=True)
        csv_path = os.path.join(batch_dir, "results.csv")
        
        file_exists = os.path.isfile(csv_path)
        
        # Standard columns
        fieldnames = ["prompt", "modelId", "width", "height", "seed", "generationId", 
                      "image_url", "local_path", "status", "timestamp", "credits", 
                      "parsed_number", "parsed_description", "parsed_group"]
        
        # Sync fallback for CSV to ensure reliability with DictWriter
        with open(csv_path, mode="a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
            if not file_exists:
                writer.writeheader()
            writer.writerow(data)

    async def append_to_key_file(self, batch_id: str, data: dict):
        """Appends a row to key_file.csv in the batch directory with prompt parsing data."""
        batch_dir = self._get_batch_dir(batch_id)
        os.makedirs(batch_dir, exist_ok=True)
        csv_path = os.path.join(batch_dir, "key_file.csv")
        
        file_exists = os.path.isfile(csv_path)
        
        fieldnames = ["Number", "Description", "Group", "Filename"]
        
        with open(csv_path, mode="a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
            if not file_exists:
                writer.writeheader()
            writer.writerow(data)

storage_service = StorageService()
