import uuid

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    country: str = Field(default="IN", min_length=2, max_length=2, pattern=r"^[A-Za-z]{2}$")
    language: str = Field(default="en", max_length=10)
    accept_terms: bool = Field(description="Must be true: user accepts data processing for the service.")


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105 - OAuth token type, not a secret
    user_id: uuid.UUID
    onboarding_completed: bool


class MeResponse(BaseModel):
    id: uuid.UUID
    email: str
    is_admin: bool
    onboarding_completed: bool
    display_name: str | None
    preferred_language: str
    country: str
