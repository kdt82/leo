"""
Simple password-based authentication for Leonardo Bulk Studio.
Uses JWT tokens stored in httpOnly cookies.
"""
import jwt
import bcrypt
from datetime import datetime, timedelta
from typing import Optional
from fastapi import HTTPException, Cookie, Response
from app.core.config import settings


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against its hash."""
    return bcrypt.checkpw(password.encode(), hashed.encode())


def create_token(expires_hours: int = 24) -> str:
    """Create a JWT token."""
    payload = {
        "exp": datetime.utcnow() + timedelta(hours=expires_hours),
        "iat": datetime.utcnow(),
        "type": "access"
    }
    return jwt.encode(payload, settings.AUTH_SECRET_KEY, algorithm="HS256")


def verify_token(token: str) -> bool:
    """Verify a JWT token is valid."""
    try:
        jwt.decode(token, settings.AUTH_SECRET_KEY, algorithms=["HS256"])
        return True
    except jwt.ExpiredSignatureError:
        return False
    except jwt.InvalidTokenError:
        return False


def check_password(password: str) -> bool:
    """Check if the provided password matches the configured AUTH_PASSWORD."""
    if not settings.AUTH_PASSWORD:
        return False
    # Direct comparison (password stored as plaintext in env for simplicity)
    # For extra security, you could store a hash instead
    return password == settings.AUTH_PASSWORD


def get_auth_dependency():
    """
    Returns an auth dependency function.
    If AUTH_ENABLED is False, returns a no-op.
    """
    async def verify_auth(auth_token: Optional[str] = Cookie(None, alias="auth_token")):
        # Skip auth if not enabled (local development)
        if not settings.AUTH_ENABLED:
            return True
        
        if not auth_token:
            raise HTTPException(
                status_code=401, 
                detail="Not authenticated. Please login."
            )
        
        if not verify_token(auth_token):
            raise HTTPException(
                status_code=401, 
                detail="Session expired. Please login again."
            )
        
        return True
    
    return verify_auth


# Create the dependency instance
verify_auth = get_auth_dependency()


def set_auth_cookie(response: Response, token: str):
    """Set the auth token as an httpOnly cookie."""
    response.set_cookie(
        key="auth_token",
        value=token,
        httponly=True,
        secure=True,  # Only send over HTTPS
        samesite="strict",
        max_age=86400  # 24 hours
    )


def clear_auth_cookie(response: Response):
    """Clear the auth cookie."""
    response.delete_cookie(key="auth_token")
