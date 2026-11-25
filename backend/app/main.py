
import os
from typing import Literal, Optional

import fitz
from dotenv import load_dotenv

# Load environment variables before importing auth.py
load_dotenv()

from fastapi import (
    FastAPI,
    Depends,
    HTTPException,
    UploadFile,
    File,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text

from .database import Base, engine, get_db
from .models import Investigation, User
from .schemas import (
    InvestigationCreate,
    InvestigationResponse,
    UserRegister,
    UserLogin,
    UserResponse,
    TokenResponse,
)
from .auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)
from .ai_service import run_rca_extraction, run_rca_analysis


# --------------------------------------------------
# DATABASE INITIALIZATION
# --------------------------------------------------

Base.metadata.create_all(bind=engine)


# --------------------------------------------------
# FASTAPI APPLICATION
# --------------------------------------------------

app = FastAPI(
    title="AIVOA.AI - Root Cause Analysis API",
    description="AI-powered pharmaceutical investigation and RCA system",
    version="2.0.0",
)


# --------------------------------------------------
# CORS CONFIGURATION
# --------------------------------------------------

frontend_url = os.getenv(
    "FRONTEND_URL",
    "http://localhost:5173"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------
# REQUEST MODELS
# --------------------------------------------------

class ExtractionRequest(BaseModel):
    text: Optional[str] = None
    source_text: Optional[str] = None


class RCAAnalysisRequest(BaseModel):
    investigation_id: int
    method: Literal["five_whys", "fishbone"] = "five_whys"


# --------------------------------------------------
# ROOT ENDPOINT
# --------------------------------------------------

@app.get("/")
def root():
    return {
        "success": True,
        "message": "AIVOA.AI Backend is running!"
    }


# --------------------------------------------------
# HEALTH CHECK
# --------------------------------------------------

@app.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))

        return {
            "success": True,
            "message": "API is healthy",
            "database": "connected"
        }

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Database connection failed"
        )


# ==================================================
# AUTHENTICATION APIs
# ==================================================

# --------------------------------------------------
# REGISTER
# --------------------------------------------------

@app.post(
    "/api/auth/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_user(
    user_data: UserRegister,
    db: Session = Depends(get_db),
):
    email = user_data.email.strip().lower()

    existing_user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists"
        )

    new_user = User(
        full_name=user_data.full_name.strip(),
        email=email,
        hashed_password=hash_password(user_data.password),
    )

    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        token = create_access_token(new_user.id)

        return TokenResponse(
            access_token=token,
            token_type="bearer",
            user=UserResponse.model_validate(new_user),
        )

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists"
        )

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not create account"
        )


# --------------------------------------------------
# LOGIN
# --------------------------------------------------

@app.post(
    "/api/auth/login",
    response_model=TokenResponse,
)
def login_user(
    login_data: UserLogin,
    db: Session = Depends(get_db),
):
    email = login_data.email.strip().lower()

    user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if not user or not verify_password(
        login_data.password,
        user.hashed_password
    ):
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password"
        )

    token = create_access_token(user.id)

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


# --------------------------------------------------
# GET LOGGED-IN USER
# --------------------------------------------------

@app.get(
    "/api/auth/me",
    response_model=UserResponse,
)
def get_logged_in_user(
    current_user: User = Depends(get_current_user),
):
    return current_user


# ==================================================
# INVESTIGATION APIs
# All investigation endpoints are user-protected.
# ==================================================


# --------------------------------------------------
# CREATE INVESTIGATION
# --------------------------------------------------

@app.post(
    "/api/investigations",
    response_model=InvestigationResponse,
)
def create_investigation(
    investigation_data: InvestigationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        new_investigation = Investigation(
            **investigation_data.model_dump(),
            user_id=current_user.id,
        )

        db.add(new_investigation)
        db.commit()
        db.refresh(new_investigation)

        return new_investigation

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not create investigation"
        )


# --------------------------------------------------
# GET ALL INVESTIGATIONS OF LOGGED-IN USER
# --------------------------------------------------

@app.get("/api/investigations")
def get_all_investigations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    investigations = (
        db.query(Investigation)
        .filter(Investigation.user_id == current_user.id)
        .order_by(Investigation.created_at.desc())
        .all()
    )

    return {
        "success": True,
        "data": investigations
    }


# --------------------------------------------------
# GET INVESTIGATION BY ID
# --------------------------------------------------

@app.get("/api/investigations/{investigation_id}")
def get_investigation(
    investigation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    investigation = (
        db.query(Investigation)
        .filter(
            Investigation.id == investigation_id,
            Investigation.user_id == current_user.id,
        )
        .first()
    )

    if not investigation:
        raise HTTPException(
            status_code=404,
            detail="Investigation not found"
        )

    return {
        "success": True,
        "data": investigation
    }


# --------------------------------------------------
# UPDATE INVESTIGATION
# --------------------------------------------------

@app.put(
    "/api/investigations/{investigation_id}",
    response_model=InvestigationResponse,
)
def update_investigation(
    investigation_id: int,
    investigation_data: InvestigationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    investigation = (
        db.query(Investigation)
        .filter(
            Investigation.id == investigation_id,
            Investigation.user_id == current_user.id,
        )
        .first()
    )

    if not investigation:
        raise HTTPException(
            status_code=404,
            detail="Investigation not found"
        )

    try:
        update_data = investigation_data.model_dump()

        for key, value in update_data.items():
            setattr(investigation, key, value)

        db.commit()
        db.refresh(investigation)

        return investigation

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not update investigation"
        )


# --------------------------------------------------
# DELETE INVESTIGATION
# --------------------------------------------------

@app.delete("/api/investigations/{investigation_id}")
def delete_investigation(
    investigation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    investigation = (
        db.query(Investigation)
        .filter(
            Investigation.id == investigation_id,
            Investigation.user_id == current_user.id,
        )
        .first()
    )

    if not investigation:
        raise HTTPException(
            status_code=404,
            detail="Investigation not found"
        )

    try:
        db.delete(investigation)
        db.commit()

        return {
            "success": True,
            "message": "Investigation deleted successfully"
        }

    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Could not delete investigation"
        )


# ==================================================
# AI EXTRACTION APIs
# ==================================================


# --------------------------------------------------
# AI TEXT EXTRACTION
# --------------------------------------------------

@app.post("/api/ai/extract")
def extract_from_text(
    request: ExtractionRequest,
    current_user: User = Depends(get_current_user),
):
    source_text = request.text or request.source_text

    if not source_text or not source_text.strip():
        raise HTTPException(
            status_code=400,
            detail="Please provide investigation text"
        )

    try:
        result = run_rca_extraction(source_text)

        return {
            "success": True,
            "message": "Information extracted successfully",
            "data": result
        }

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="AI extraction failed"
        )


# --------------------------------------------------
# AI PDF EXTRACTION
# --------------------------------------------------

@app.post("/api/ai/extract-pdf")
async def extract_from_pdf(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported"
        )

    try:
        contents = await file.read()

        if not contents:
            raise HTTPException(
                status_code=400,
                detail="Uploaded PDF is empty"
            )

        if len(contents) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=400,
                detail="PDF size must not exceed 10 MB"
            )

        pdf_document = fitz.open(
            stream=contents,
            filetype="pdf"
        )

        try:
            extracted_text = "\n".join(
                page.get_text()
                for page in pdf_document
            )
        finally:
            pdf_document.close()

        if not extracted_text.strip():
            raise HTTPException(
                status_code=400,
                detail="No readable text found in the PDF"
            )

        result = run_rca_extraction(extracted_text)

        return {
            "success": True,
            "message": "PDF information extracted successfully",
            "data": result
        }

    except HTTPException:
        raise

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="PDF extraction failed"
        )


# ==================================================
# AI ROOT CAUSE ANALYSIS
# ==================================================

@app.post("/api/ai/analyze-rca")
def analyze_root_cause(
    request: RCAAnalysisRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    investigation = (
        db.query(Investigation)
        .filter(
            Investigation.id == request.investigation_id,
            Investigation.user_id == current_user.id,
        )
        .first()
    )

    if not investigation:
        raise HTTPException(
            status_code=404,
            detail="Investigation not found"
        )

    extracted_data = investigation.extracted_data or {}

    if not extracted_data:
        raise HTTPException(
            status_code=400,
            detail="No extracted investigation data available"
        )

    if (
        isinstance(extracted_data, dict)
        and isinstance(extracted_data.get("data"), dict)
    ):
        extracted_data = extracted_data["data"]

    try:
        result = run_rca_analysis(
            extracted_data=extracted_data,
            method=request.method
        )

        # AI-generated RCA is returned for human review.
        # It is not saved until the user reviews and updates it.

        return {
            "success": True,
            "message": (
                "Root cause analysis generated successfully. "
                "Human review required."
            ),
            "data": {
                "investigation_id": investigation.id,
                "analysis": result,
                "capa_recommendations": result.get(
                    "capa_recommendations", []
                ),
                "human_review_required": True
            }
        }

    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Root cause analysis failed"
        )
