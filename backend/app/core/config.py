import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Leonardo Bulk Studio"
    
    # CORS - configurable via environment
    BACKEND_CORS_ORIGINS: list[str] = os.getenv(
        "CORS_ORIGINS", 
        "http://localhost:5173,http://localhost:3000"
    ).split(",")
    
    # Leonardo API
    LEONARDO_API_KEY: str | None = os.getenv("LEONARDO_API_KEY")
    LEONARDO_API_URL: str = "https://cloud.leonardo.ai/api/rest/v1"
    
    # Database - PostgreSQL for production, SQLite for local dev
    DATABASE_URL: str | None = os.getenv("DATABASE_URL")
    USE_POSTGRES: bool = DATABASE_URL is not None and DATABASE_URL.startswith("postgresql")
    
    # Authentication
    AUTH_PASSWORD: str | None = os.getenv("AUTH_PASSWORD")
    AUTH_SECRET_KEY: str = os.getenv("AUTH_SECRET_KEY", "dev-secret-change-in-production")
    AUTH_ENABLED: bool = AUTH_PASSWORD is not None
    
    # Output
    OUTPUT_DIR: str = os.path.join(os.getcwd(), "outputs")

settings = Settings()
os.makedirs(settings.OUTPUT_DIR, exist_ok=True)

