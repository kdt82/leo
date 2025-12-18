from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.routes import router as api_router
from app.services.queue_manager import queue_manager
from app.services.job_processor import process_generation_job
from app.services.db import init_db
import asyncio
import os
from fastapi.staticfiles import StaticFiles # Added this import as it's used later

app = FastAPI(title=settings.PROJECT_NAME, openapi_url=f"{settings.API_V1_STR}/openapi.json")

# Set all CORS enabled origins
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Mount outputs directory
if os.path.exists(settings.OUTPUT_DIR):
    app.mount("/outputs", StaticFiles(directory=settings.OUTPUT_DIR), name="outputs")

app.include_router(api_router, prefix=settings.API_V1_STR)


@app.on_event("startup")
async def startup_event():
    init_db()
    # Register handler
    queue_manager.handler_callback = process_generation_job
    await queue_manager.start()

@app.on_event("shutdown")
async def shutdown_event():
    await queue_manager.stop()

@app.get("/")
def root():
    return {"message": "Leonardo Bulk Studio API is running"}

@app.get("/health")
def health_check():
    return {"status": "ok"}
