import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Leonardo Bulk Studio"
    
    # Cors
    BACKEND_CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    
    # Leonardo API
    LEONARDO_API_KEY: str | None = os.getenv("LEONARDO_API_KEY")
    LEONARDO_API_URL: str = "https://cloud.leonardo.ai/api/rest/v1"
    
    # Output
    OUTPUT_DIR: str = os.path.join(os.getcwd(), "outputs")

settings = Settings()
os.makedirs(settings.OUTPUT_DIR, exist_ok=True)
