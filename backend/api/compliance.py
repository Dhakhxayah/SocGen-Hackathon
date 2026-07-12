from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database.db import get_db
from services.compliance_mapper import compliance_coverage

router = APIRouter()


@router.get("/compliance")
def get_compliance(db: Session = Depends(get_db)):
    return compliance_coverage(db)
