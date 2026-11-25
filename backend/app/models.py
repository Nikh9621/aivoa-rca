
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    JSON,
    ForeignKey,
)
from sqlalchemy.sql import func
from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )


class Investigation(Base):
    __tablename__ = "investigations"

    id = Column(Integer, primary_key=True, index=True)

    # Nullable temporarily to preserve existing investigations.
    # New investigations will always receive the logged-in user's ID.
    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
        index=True
    )

    title = Column(String(255), nullable=False)

    product_name = Column(String(255))
    batch_number = Column(String(100))

    process = Column(String(255))
    equipment = Column(String(255))

    deviation_description = Column(Text)

    investigation_status = Column(
        String(50),
        default="draft"
    )

    extracted_data = Column(JSON, default=dict)
    rca_data = Column(JSON, default=dict)
    capa_data = Column(JSON, default=list)

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )
