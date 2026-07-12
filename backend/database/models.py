"""
ORM models for SecureDrift AI.

Tables:
- Control            : baseline configuration per control (the "should be" state)
- ChangeEvent         : every observed change (raw signal, benign or drift)
- DriftEvent          : subset of ChangeEvents classified as drift, scored + suppressed
- MaintenanceWindow   : approved change windows used for suppression
- Incident            : correlated compound drift (2+ drift events, same actor/system/window)
"""
import datetime as dt
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey
)
from sqlalchemy.orm import relationship
from database.db import Base


class Control(Base):
    __tablename__ = "controls"

    id = Column(Integer, primary_key=True, index=True)
    control_id = Column(String, unique=True, index=True)          # e.g. LOG-012
    domain = Column(String, index=True)                            # cloud | network | endpoint | identity
    category = Column(String, index=True)                          # logging | encryption | firewall | endpoint | access
    system = Column(String)                                        # AWS CloudTrail, Palo Alto, CrowdStrike...
    system_instance = Column(String, index=True)                   # e.g. srv-014 — node id in the infra graph
    parameter = Column(String)                                     # cloudtrail_enabled
    baseline_value = Column(String)                                # stored as string, cast on use
    environment = Column(String, index=True)                       # production | staging | dev
    exposure = Column(String, default="internal")                  # internet_facing | internal
    severity_if_drifted = Column(String)                           # CRITICAL | HIGH | MEDIUM | LOW
    compliance_mappings = Column(Text)                             # JSON list string

    events = relationship("ChangeEvent", back_populates="control")


class MaintenanceWindow(Base):
    __tablename__ = "maintenance_windows"

    id = Column(Integer, primary_key=True, index=True)
    window_id = Column(String, unique=True, index=True)
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    scope = Column(Text)             # JSON list of control_ids or domains covered
    approved_by = Column(String)
    approved = Column(Boolean, default=True)


class SystemDependency(Base):
    """
    Synthetic infrastructure dependency graph edges (app -> db -> server, plus
    same-environment clustering). Used by the blast-radius engine to estimate
    which systems/data are exposed by a given compound drift incident.
    """
    __tablename__ = "system_dependencies"

    id = Column(Integer, primary_key=True, index=True)
    source_system = Column(String, index=True)
    target_system = Column(String, index=True)
    relation = Column(String)            # depends_on | clustered_with | same_vpc
    environment = Column(String)


class ChangeEvent(Base):
    __tablename__ = "change_events"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(String, unique=True, index=True)
    timestamp = Column(DateTime, index=True)
    control_id = Column(String, ForeignKey("controls.control_id"), index=True)
    action = Column(String)                     # modification | disable | enable
    parameter = Column(String)
    baseline_value = Column(String)
    current_value = Column(String)
    changed_by = Column(String, index=True)      # actor
    change_source = Column(String, index=True)   # ci_cd | manual | autoscale | emergency_bypass
    approval_status = Column(String)             # approved | pending | none | expired_temporary
    environment = Column(String)
    maintenance_window = Column(Boolean, default=False)
    domain = Column(String)
    category = Column(String)

    # Ground-truth label assigned by the simulator at generation time (not
    # derived from any detector output). Used purely for self-evaluation:
    # "risky"    -> a real drift that SHOULD be surfaced to a security analyst
    # "benign"   -> noise that SHOULD be suppressed (approved CI/CD, autoscale, etc.)
    # "ambiguous"-> genuinely unclear, SHOULD be routed to a human, not auto-decided
    # "normal"   -> no real change happened at all (matches baseline)
    ground_truth_label = Column(String, default="normal", index=True)

    control = relationship("Control", back_populates="events")
    drift = relationship("DriftEvent", back_populates="change_event", uselist=False)


class DriftEvent(Base):
    __tablename__ = "drift_events"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(String, ForeignKey("change_events.event_id"), unique=True, index=True)
    control_id = Column(String, index=True)
    timestamp = Column(DateTime, index=True)
    domain = Column(String, index=True)
    category = Column(String, index=True)
    environment = Column(String)
    changed_by = Column(String, index=True)
    change_source = Column(String)
    approval_status = Column(String)
    maintenance_window = Column(Boolean, default=False)

    is_drift = Column(Boolean, default=False)          # False = matches baseline (normal state)
    severity = Column(String, index=True)               # CRITICAL | HIGH | MEDIUM | LOW | NONE
    description = Column(String)

    suppressed = Column(Boolean, default=False, index=True)
    suppression_reason = Column(String, nullable=True)
    ambiguous = Column(Boolean, default=False)          # e.g. temp change past expiry
    ambiguous_reason = Column(String, nullable=True)

    risk_score = Column(Float, default=0.0)
    status = Column(String, default="new")              # new | reviewed | remediated

    # ML anomaly detection (Isolation Forest)
    ml_anomaly_score = Column(Float, nullable=True)      # normalized 0-100, higher = more anomalous
    ml_is_anomaly = Column(Boolean, default=False)       # flagged by the trained model
    ml_feature_snapshot = Column(Text, nullable=True)    # JSON of the feature vector used, for explainability

    incident_id = Column(Integer, ForeignKey("incidents.id"), nullable=True)

    change_event = relationship("ChangeEvent", back_populates="drift")
    incident = relationship("Incident", back_populates="drift_events")


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True)
    incident_id = Column(String, unique=True, index=True)
    title = Column(String)
    actor = Column(String)
    window_start = Column(DateTime)
    window_end = Column(DateTime)
    domains_involved = Column(Text)      # JSON list
    controls_involved = Column(Text)     # JSON list
    max_severity = Column(String)
    total_risk_score = Column(Float, default=0.0)
    is_compound = Column(Boolean, default=False)   # True if 3+ domains involved
    created_at = Column(DateTime, default=dt.datetime.utcnow)

    # Blast radius (NetworkX graph traversal from affected systems)
    blast_radius_score = Column(Float, default=0.0)
    blast_radius_systems = Column(Text, nullable=True)   # JSON list of exposed system_instance ids
    blast_radius_hops = Column(Integer, default=0)

    ai_root_cause = Column(Text, nullable=True)
    ai_risk_explanation = Column(Text, nullable=True)
    ai_mitre_technique = Column(Text, nullable=True)
    ai_compliance_impact = Column(Text, nullable=True)
    ai_remediation_steps = Column(Text, nullable=True)   # JSON list, ordered
    ai_priority = Column(String, nullable=True)
    ai_generated_at = Column(DateTime, nullable=True)

    drift_events = relationship("DriftEvent", back_populates="incident")
