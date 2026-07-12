from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database.db import get_db
from services.actor_profile import compute_actor_profiles, get_actor_detail

router = APIRouter()


@router.get("/actors")
def list_actors(db: Session = Depends(get_db)):
    """Ranked insider-risk profile per actor across all drift activity."""
    return compute_actor_profiles(db)


@router.get("/actors/{actor}")
def actor_detail(actor: str, db: Session = Depends(get_db)):
    detail = get_actor_detail(db, actor)
    if not detail:
        return {"error": "not found"}
    return detail
