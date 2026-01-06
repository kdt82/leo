from fastapi import FastAPI, Depends, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.core.config import settings
from app.core.auth import verify_auth, check_password, create_token, set_auth_cookie, clear_auth_cookie
from app.api.routes import router as api_router
from app.services.queue_manager import queue_manager
from app.services.job_processor import process_generation_job
from app.services import db
import asyncio
import os
from fastapi.staticfiles import StaticFiles

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


# ============================================================
# AUTH ENDPOINTS (not protected)
# ============================================================

class LoginRequest(BaseModel):
    password: str

class AuthStatus(BaseModel):
    authenticated: bool
    auth_enabled: bool


@app.post(f"{settings.API_V1_STR}/auth/login")
async def login(request: LoginRequest, response: Response):
    """Login with password."""
    if not settings.AUTH_ENABLED:
        return {"success": True, "message": "Auth disabled"}
    
    if not check_password(request.password):
        raise HTTPException(status_code=401, detail="Invalid password")
    
    token = create_token()
    set_auth_cookie(response, token)
    return {"success": True}


@app.post(f"{settings.API_V1_STR}/auth/logout")
async def logout(response: Response):
    """Logout and clear auth cookie."""
    clear_auth_cookie(response)
    return {"success": True}


@app.get(f"{settings.API_V1_STR}/auth/status", response_model=AuthStatus)
async def auth_status():
    """Check if auth is enabled and if user has valid session."""
    return {
        "authenticated": False,  # Will be overridden by frontend cookie check
        "auth_enabled": settings.AUTH_ENABLED
    }


@app.get(f"{settings.API_V1_STR}/auth/check")
async def check_auth(authorized: bool = Depends(verify_auth)):
    """Check if current session is valid. Returns 401 if not."""
    return {"authenticated": True}


# ============================================================
# PROTECTED API ROUTES
# ============================================================

# All routes in api_router are protected by auth
app.include_router(
    api_router, 
    prefix=settings.API_V1_STR,
    dependencies=[Depends(verify_auth)]
)


# ============================================================
# LIFECYCLE EVENTS
# ============================================================

@app.on_event("startup")
async def startup_event():
    await db.init_db()
    # Register handler
    queue_manager.handler_callback = process_generation_job
    await queue_manager.start()


@app.on_event("shutdown")
async def shutdown_event():
    await queue_manager.stop()
    if settings.USE_POSTGRES:
        await db.close_pool()


# ============================================================
# HEALTH ENDPOINTS (not protected)
# ============================================================

@app.get("/")
def root():
    return {"message": "Leonardo Bulk Studio API is running"}


@app.get("/health")
def health_check():
    return {"status": "ok", "auth_enabled": settings.AUTH_ENABLED}
