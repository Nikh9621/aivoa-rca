
from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, Field


# Authentication schemas

class UserRegister(BaseModel):
    full_name: str = Field(min_length=2, max_length=255)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: int
    full_name: str
    email: str

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# Investigation schemas

class InvestigationCreate(BaseModel):
    title: str
    product_name: str | None = None
    batch_number: str | None = None
    process: str | None = None
    equipment: str | None = None
    deviation_description: str | None = None
    investigation_status: str = "draft"
    extracted_data: dict[str, Any] = Field(default_factory=dict)
    rca_data: dict[str, Any] = Field(default_factory=dict)
    capa_data: list[dict[str, Any]] = Field(default_factory=list)


class InvestigationResponse(InvestigationCreate):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
