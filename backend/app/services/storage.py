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

    async def save_image(self, url: str, batch_id: str, prompt_index: int, image_index: int) -> str:
        """Downloads and saves an image, returns local path."""
        batch_dir = self._get_batch_dir(batch_id)
        prompt_dir = os.path.join(batch_dir, f"p_{prompt_index}")
        os.makedirs(prompt_dir, exist_ok=True)
        
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
                      "image_url", "local_path", "status", "timestamp", "credits"]
        
        # Filter data to match fieldnames, allow extras
        # We might want to just dump everything
        
        async with aiofiles.open(csv_path, mode="a", newline="") as f:
            # aiofiles doesn't support csv.DictWriter directly comfortably for async?
            # actually it's easier to verify sync write for CSV or use pandas, 
            # but for log appending, simple string format or wrapping in sync function is better.
            # Let's use sync open for CSV to avoid complexity, unlikely to block main loop much 
            # if we do it in a thread or just quickly.
            pass

        # Sync fallback for CSV to ensure reliability with DictWriter
        with open(csv_path, mode="a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
            if not file_exists:
                writer.writeheader()
            writer.writerow(data)

storage_service = StorageService()
