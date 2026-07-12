"""
Module 1 — Enterprise Simulator

Generates realistic multi-domain control baselines, maintenance windows, and
change events (the "Data Reality & Edge Cases" from the problem statement):
CI/CD noise, approved maintenance, autoscaling, emergency bypasses, expired
temporary changes, and the four real-incident scenarios called out in the PS
(encryption downgrade, CloudTrail disable, port 8080 left open, endpoint
agents silently stopped).
"""
import json
import random
import string
import datetime as dt
from sqlalchemy.orm import Session

from database.models import Control, ChangeEvent, MaintenanceWindow

random.seed()  # re-seed on every simulate call for a fresh but plausible dataset

ENVIRONMENTS = ["production", "staging", "dev"]
ENV_WEIGHTS = [0.55, 0.30, 0.15]

DOMAINS = ["cloud", "network", "endpoint", "identity"]

ACTORS = [
    "admin_001", "admin_002", "admin_003", "svc_pipeline_bot", "svc_autoscaler",
    "engineer_ravi", "engineer_meera", "engineer_john", "contractor_vendor_x",
    "svc_terraform_ci", "oncall_bot",
]

CHANGE_SOURCES = ["ci_cd", "manual", "autoscale", "emergency_bypass"]
CHANGE_SOURCE_WEIGHTS = [0.42, 0.33, 0.20, 0.05]

APPROVAL_STATUSES = ["approved", "pending", "none", "expired_temporary"]

# ---------------------------------------------------------------------------
# Control catalog templates: (domain, category, system, parameter, baseline,
# severity_if_drifted, compliance mapping)
# ---------------------------------------------------------------------------
CONTROL_TEMPLATES = [
    ("cloud", "logging", "AWS CloudTrail", "cloudtrail_enabled", "true", "CRITICAL",
     ["NIST AU-2", "NIST CM-3", "NIST SI-4", "CIS 8.5", "GDPR Art. 32"]),
    ("cloud", "logging", "Azure Monitor", "diagnostic_logging_enabled", "true", "CRITICAL",
     ["NIST AU-2", "CIS 8.5", "GDPR Art. 32"]),
    ("cloud", "encryption", "AWS RDS", "encryption_algorithm", "AES-256", "HIGH",
     ["NIST SC-13", "CIS 3.9", "GDPR Art. 32"]),
    ("cloud", "encryption", "AWS S3", "sse_encryption", "AES-256", "HIGH",
     ["NIST SC-13", "CIS 3.9", "GDPR Art. 32"]),
    ("cloud", "encryption", "Azure Storage", "encryption_algorithm", "AES-256", "HIGH",
     ["NIST SC-13", "CIS 3.9"]),
    ("cloud", "access", "AWS IAM", "mfa_required", "true", "HIGH",
     ["NIST IA-2", "CIS 6.5", "GDPR Art. 25"]),
    ("cloud", "access", "AWS Security Group", "public_ingress_allowed", "false", "HIGH",
     ["NIST CM-6", "CIS 4.4", "GDPR Art. 32"]),
    ("network", "firewall", "Palo Alto FW-Edge", "port_8080_allowed", "false", "MEDIUM",
     ["NIST CM-6", "CIS 4.4"]),
    ("network", "firewall", "Palo Alto FW-Core", "port_3389_allowed", "false", "HIGH",
     ["NIST CM-6", "CIS 4.4"]),
    ("network", "firewall", "Cisco ASA", "any_any_rule_present", "false", "CRITICAL",
     ["NIST CM-6", "CIS 4.4", "GDPR Art. 32"]),
    ("network", "logging", "Cisco Switch Core-1", "syslog_forwarding_enabled", "true", "HIGH",
     ["NIST AU-2", "CIS 8.5"]),
    ("endpoint", "endpoint", "CrowdStrike Falcon", "agent_running", "true", "CRITICAL",
     ["NIST SI-4", "CIS 10.1", "GDPR Art. 32"]),
    ("endpoint", "endpoint", "CrowdStrike Falcon", "realtime_protection_enabled", "true", "HIGH",
     ["NIST SI-4", "CIS 10.1"]),
    ("endpoint", "endpoint", "Windows Defender", "tamper_protection_enabled", "true", "HIGH",
     ["NIST SI-4", "CIS 10.1"]),
    ("identity", "access", "Okta", "mfa_enforced", "true", "CRITICAL",
     ["NIST IA-2", "CIS 6.5", "GDPR Art. 25"]),
    ("identity", "access", "Azure AD", "conditional_access_enabled", "true", "HIGH",
     ["NIST IA-2", "CIS 6.5"]),
    ("identity", "access", "Okta", "session_timeout_minutes", "30", "LOW",
     ["NIST AC-12", "CIS 6.7"]),
    ("network", "firewall", "Fortinet FW-DMZ", "vendor_temp_rule_active", "false", "MEDIUM",
     ["NIST CM-3", "CIS 4.4"]),
]

SYSTEM_INSTANCES = [f"srv-{i:03d}" for i in range(1, 41)] + \
                    [f"db-{i:02d}" for i in range(1, 11)] + \
                    [f"app-{i:02d}" for i in range(1, 16)]


def _rand_id(prefix, n=6):
    return f"{prefix}-{''.join(random.choices(string.ascii_lowercase + string.digits, k=n))}"


def generate_controls(session: Session, count_per_template_range=(3, 6)):
    """Expand control templates across environments/system instances -> 50-100 controls."""
    controls = []
    seq = {}
    for domain, category, system, parameter, baseline, severity, mappings in CONTROL_TEMPLATES:
        n = random.randint(*count_per_template_range)
        for _ in range(n):
            env = random.choices(ENVIRONMENTS, ENV_WEIGHTS)[0]
            key = f"{category[:3].upper()}"
            seq[key] = seq.get(key, 0) + 1
            control_id = f"{key}-{seq[key]:03d}"
            exposure = "internet_facing" if (category == "firewall" and random.random() < 0.3) else \
                       ("internet_facing" if (category == "access" and random.random() < 0.15) else "internal")
            instance = random.choice(SYSTEM_INSTANCES)
            c = Control(
                control_id=control_id,
                domain=domain,
                category=category,
                system=f"{system} ({instance})",
                system_instance=instance,
                parameter=parameter,
                baseline_value=baseline,
                environment=env,
                exposure=exposure,
                severity_if_drifted=severity,
                compliance_mappings=json.dumps(mappings),
            )
            controls.append(c)
    session.add_all(controls)
    session.commit()
    return controls


def generate_system_dependencies(session: Session):
    """
    Builds a synthetic but architecturally plausible infra dependency graph:
    app-* -> db-* -> srv-* (depends_on), plus srv-* clustering (same_vpc) for
    redundancy pairs. This is what the blast-radius engine traverses to answer
    "which systems/data are exposed by this combined drift?"
    """
    from database.models import SystemDependency

    apps = [s for s in SYSTEM_INSTANCES if s.startswith("app-")]
    dbs = [s for s in SYSTEM_INSTANCES if s.startswith("db-")]
    srvs = [s for s in SYSTEM_INSTANCES if s.startswith("srv-")]

    edges = []
    for app in apps:
        db = random.choice(dbs)
        edges.append(SystemDependency(source_system=app, target_system=db, relation="depends_on"))

    for db in dbs:
        srv = random.choice(srvs)
        edges.append(SystemDependency(source_system=db, target_system=srv, relation="depends_on"))
        # some databases are also replicated to a second server (broader blast radius)
        if random.random() < 0.4:
            srv2 = random.choice(srvs)
            if srv2 != srv:
                edges.append(SystemDependency(source_system=db, target_system=srv2, relation="replicated_to"))

    # server clustering / shared VPC (redundancy pairs -> lateral exposure)
    random.shuffle(srvs)
    for i in range(0, len(srvs) - 1, 3):
        cluster = srvs[i:i + 3]
        for a, b in zip(cluster, cluster[1:]):
            edges.append(SystemDependency(source_system=a, target_system=b, relation="same_vpc"))

    session.add_all(edges)
    session.commit()
    return edges


def generate_maintenance_windows(session: Session, controls, count=35):
    windows = []
    now = dt.datetime.utcnow()
    for i in range(count):
        start = now - dt.timedelta(days=random.randint(0, 30), hours=random.randint(0, 23))
        end = start + dt.timedelta(hours=random.choice([1, 2, 4, 6]))
        scope_controls = random.sample(controls, k=min(len(controls), random.randint(2, 8)))
        w = MaintenanceWindow(
            window_id=_rand_id("mw"),
            start_time=start,
            end_time=end,
            scope=json.dumps([c.control_id for c in scope_controls]),
            approved_by=random.choice(ACTORS),
            approved=True,
        )
        windows.append(w)
    session.add_all(windows)
    session.commit()
    return windows


def _in_any_window(ts, windows, control_id):
    for w in windows:
        scope = json.loads(w.scope)
        if w.start_time <= ts <= w.end_time and control_id in scope:
            return True
    return False


def _flip_value(baseline_value, category):
    """Produce a plausible drifted value for a given control category."""
    if category == "encryption":
        return "AES-128" if baseline_value == "AES-256" else baseline_value
    if baseline_value in ("true", "false"):
        return "false" if baseline_value == "true" else "true"
    if category == "access" and baseline_value.isdigit():
        return str(int(baseline_value) * random.choice([2, 3, 4]))  # e.g. session timeout raised
    return "modified_value"


def generate_change_events(session: Session, controls, windows, count=750):
    """
    Produces the mix described in the PS:
      ~5-8% critical, ~8-12% high, ~10-15% medium, ~40-50% benign,
      ~10-15% ambiguous, ~10-20% normal (no real drift).
    """
    events = []
    now = dt.datetime.utcnow()

    # Bucket target counts
    n_critical = int(count * random.uniform(0.05, 0.08))
    n_high = int(count * random.uniform(0.08, 0.12))
    n_medium = int(count * random.uniform(0.10, 0.15))
    n_ambiguous = int(count * random.uniform(0.10, 0.15))
    n_normal = int(count * random.uniform(0.10, 0.20))
    n_benign = max(0, count - (n_critical + n_high + n_medium + n_ambiguous + n_normal))

    by_severity = {
        "CRITICAL": [c for c in controls if c.severity_if_drifted == "CRITICAL"] or controls,
        "HIGH": [c for c in controls if c.severity_if_drifted == "HIGH"] or controls,
        "MEDIUM": [c for c in controls if c.severity_if_drifted == "MEDIUM"] or controls,
        "LOW": [c for c in controls if c.severity_if_drifted == "LOW"] or controls,
    }

    def make_event(control, drifted, source=None, approval=None, window_flag=None, force_ts=None,
                   gt_label="normal"):
        ts = force_ts or (now - dt.timedelta(
            days=random.randint(0, 45),
            hours=random.randint(0, 23),
            minutes=random.randint(0, 59),
        ))
        source = source or random.choices(CHANGE_SOURCES, CHANGE_SOURCE_WEIGHTS)[0]
        actor = random.choice(ACTORS)
        if source == "ci_cd":
            actor = "svc_pipeline_bot"
        elif source == "autoscale":
            actor = "svc_autoscaler"

        in_window = window_flag if window_flag is not None else _in_any_window(ts, windows, control.control_id)
        approval = approval or (
            "approved" if (source in ("ci_cd", "autoscale") or in_window) and random.random() < 0.85
            else random.choices(APPROVAL_STATUSES, [0.35, 0.30, 0.20, 0.15])[0]
        )

        current_value = _flip_value(control.baseline_value, control.category) if drifted else control.baseline_value

        e = ChangeEvent(
            event_id=_rand_id("drift-evt"),
            timestamp=ts,
            control_id=control.control_id,
            action="modification" if drifted else "no_change",
            parameter=control.parameter,
            baseline_value=control.baseline_value,
            current_value=current_value,
            changed_by=actor,
            change_source=source,
            approval_status=approval,
            environment=control.environment,
            maintenance_window=in_window,
            domain=control.domain,
            category=control.category,
            ground_truth_label=gt_label,
        )
        return e

    # Critical + High + Medium real drift
    for sev, n in [("CRITICAL", n_critical), ("HIGH", n_high), ("MEDIUM", n_medium)]:
        pool = by_severity[sev]
        for _ in range(n):
            control = random.choice(pool)
            # skew toward risky combos: unapproved manual/emergency change, no maintenance window
            source = random.choices(
                ["manual", "emergency_bypass", "ci_cd"], [0.55, 0.25, 0.20]
            )[0]
            approval = random.choices(["pending", "none", "approved"], [0.45, 0.35, 0.20])[0]
            events.append(make_event(control, drifted=True, source=source, approval=approval,
                                      window_flag=False, gt_label="risky"))

    # Ambiguous: expired temporary changes / partial reverts
    for _ in range(n_ambiguous):
        control = random.choice(controls)
        events.append(make_event(control, drifted=True, source="manual", approval="expired_temporary",
                                  gt_label="ambiguous"))

    # Benign: CI/CD + autoscale + approved maintenance, low-severity or matches baseline
    for _ in range(n_benign):
        control = random.choice(controls)
        drifted = random.random() < 0.3  # some benign "drift" is a low-impact timeout tweak etc.
        source = random.choices(["ci_cd", "autoscale"], [0.6, 0.4])[0]
        events.append(make_event(control, drifted=drifted, source=source, approval="approved",
                                  gt_label="benign"))

    # Normal state: no real change, matches baseline
    for _ in range(n_normal):
        control = random.choice(controls)
        events.append(make_event(control, drifted=False, gt_label="normal"))

    # --- Inject the 4 signature "Real Incidents" from the PS for a compelling demo ---
    log_controls = [c for c in controls if c.category == "logging"]
    enc_controls = [c for c in controls if c.category == "encryption"]
    fw_controls = [c for c in controls if c.category == "firewall"]
    ep_controls = [c for c in controls if c.category == "endpoint"]

    incident_ts = now - dt.timedelta(hours=6)
    if enc_controls:
        events.append(make_event(random.choice(enc_controls), drifted=True,
                                  source="ci_cd", approval="approved", window_flag=False,
                                  force_ts=now - dt.timedelta(days=1), gt_label="risky"))
    if log_controls:
        c = random.choice(log_controls)
        events.append(make_event(c, drifted=True, source="manual", approval="pending",
                                  window_flag=False, force_ts=incident_ts, gt_label="risky"))
        if fw_controls:
            events.append(make_event(random.choice(fw_controls), drifted=True, source="manual",
                                      approval="none", window_flag=False,
                                      force_ts=incident_ts + dt.timedelta(minutes=28), gt_label="risky"))
        if enc_controls:
            events.append(make_event(random.choice(enc_controls), drifted=True, source="manual",
                                      approval="none", window_flag=False,
                                      force_ts=incident_ts + dt.timedelta(minutes=35), gt_label="risky"))
    if fw_controls:
        events.append(make_event(random.choice(fw_controls), drifted=True, source="manual",
                                  approval="expired_temporary", window_flag=False,
                                  force_ts=now - dt.timedelta(days=730), gt_label="ambiguous"))
    if ep_controls:
        base_ts = now - dt.timedelta(hours=3)
        chosen = random.sample(ep_controls, k=min(3, len(ep_controls)))
        for c in chosen:
            events.append(make_event(c, drifted=True, source="manual", approval="none",
                                      window_flag=False, force_ts=base_ts + dt.timedelta(minutes=random.randint(0, 10)),
                                      gt_label="risky"))

    session.add_all(events)
    session.commit()
    return events


def run_full_simulation(session: Session, n_controls_range=(3, 6), n_windows=35, n_events=750):
    """Wipes and regenerates the full simulated enterprise dataset."""
    from database.models import Control, ChangeEvent, MaintenanceWindow, DriftEvent, Incident, SystemDependency
    session.query(DriftEvent).delete()
    session.query(Incident).delete()
    session.query(ChangeEvent).delete()
    session.query(MaintenanceWindow).delete()
    session.query(SystemDependency).delete()
    session.query(Control).delete()
    session.commit()

    controls = generate_controls(session, n_controls_range)
    dependencies = generate_system_dependencies(session)
    windows = generate_maintenance_windows(session, controls, n_windows)
    events = generate_change_events(session, controls, windows, n_events)
    return {
        "controls": len(controls),
        "system_dependencies": len(dependencies),
        "maintenance_windows": len(windows),
        "change_events": len(events),
    }
