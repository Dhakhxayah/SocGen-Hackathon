from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database.db import get_db
from services.evaluation import compute_self_evaluation

router = APIRouter()


@router.get("/evaluation")
def get_evaluation(db: Session = Depends(get_db)):
    """
    Self-evaluation against the problem statement's own success targets:
    Precision >75%, Recall >70%, Critical recall >95%, Benign suppression >85%.
    Computed against simulator-assigned ground truth, independent of the
    detector/suppression/ML output being scored.
    """
    return compute_self_evaluation(db)
