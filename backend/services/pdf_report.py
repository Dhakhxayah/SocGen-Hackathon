"""
Module 9 — Executive PDF Report

Builds a single, audit-meeting-ready PDF: exec summary of security &
compliance posture, the top risky incidents with AI root cause, and a
compliance framework coverage snapshot. Complements the raw CSV exports
already served from /report and /report/full-export.
"""
import io
import json
import datetime as dt

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
)
from sqlalchemy.orm import Session

from database.models import DriftEvent, Control, Incident
from services.compliance_mapper import compliance_coverage
from services.state import currently_failing_control_ids

INK = colors.HexColor("#0F141C")
BRAND = colors.HexColor("#169983")
CRITICAL = colors.HexColor("#D9304A")
HIGH = colors.HexColor("#D9822B")
MUTED = colors.HexColor("#5B6472")
LIGHT_ROW = colors.HexColor("#F3F5F7")

SEV_COLOR = {"CRITICAL": CRITICAL, "HIGH": HIGH, "MEDIUM": colors.HexColor("#C9A227"),
             "LOW": colors.HexColor("#2E9E5B")}


def _styles():
    ss = getSampleStyleSheet()
    ss.add(ParagraphStyle(name="H1Brand", parent=ss["Heading1"], textColor=INK, fontSize=20, spaceAfter=2))
    ss.add(ParagraphStyle(name="SubTitle", parent=ss["Normal"], textColor=MUTED, fontSize=9.5, spaceAfter=14))
    ss.add(ParagraphStyle(name="SectionHeader", parent=ss["Heading2"], textColor=INK, fontSize=12.5,
                           spaceBefore=14, spaceAfter=6))
    ss.add(ParagraphStyle(name="Body", parent=ss["Normal"], fontSize=8.8, textColor=INK, leading=12))
    ss.add(ParagraphStyle(name="BodyMuted", parent=ss["Normal"], fontSize=8.3, textColor=MUTED, leading=11))
    return ss


def _kpi_table(dashboard: dict, styles):
    data = [
        ["Security Score", "Compliance Score", "Active Critical", "Active High", "Compound Incidents"],
        [
            f"{dashboard['security_score']}%",
            f"{dashboard['compliance_score']}%",
            str(dashboard["critical_drift_count"]),
            str(dashboard["high_drift_count"]),
            str(dashboard["compound_incidents"]),
        ],
    ]
    t = Table(data, colWidths=[1.9 * inch] * 5)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, 0), 7.5),
        ("FONTSIZE", (0, 1), (-1, 1), 15),
        ("FONTNAME", (0, 1), (-1, 1), "Helvetica-Bold"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, 0), 6),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 6),
        ("TOPPADDING", (0, 1), (-1, 1), 8),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 10),
        ("BACKGROUND", (0, 1), (-1, 1), LIGHT_ROW),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#D8DCE1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D8DCE1")),
    ]))
    return t


def _incident_table(incidents, styles):
    header = ["Incident", "Severity", "Domains", "Actor", "Risk", "Blast", "Status"]
    rows = [header]
    for inc in incidents:
        domains = ", ".join(json.loads(inc.domains_involved or "[]"))
        rows.append([
            inc.incident_id,
            inc.max_severity,
            domains,
            inc.actor,
            f"{inc.total_risk_score:.0f}",
            f"{inc.blast_radius_score:.0f}",
            "Compound" if inc.is_compound else "Single-domain",
        ])
    t = Table(rows, colWidths=[0.8 * inch, 0.75 * inch, 1.5 * inch, 1.15 * inch, 0.55 * inch, 0.55 * inch, 1.0 * inch])
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 7.6),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D8DCE1")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#D8DCE1")),
    ]
    for i, inc in enumerate(incidents, start=1):
        c = SEV_COLOR.get(inc.max_severity, MUTED)
        style.append(("TEXTCOLOR", (1, i), (1, i), c))
        style.append(("FONTNAME", (1, i), (1, i), "Helvetica-Bold"))
        if i % 2 == 0:
            style.append(("BACKGROUND", (0, i), (-1, i), LIGHT_ROW))
    t.setStyle(TableStyle(style))
    return t


def _compliance_table(coverage: dict):
    rows = [["Framework", "Passing Controls", "Total Controls", "Coverage"]]
    for fw, v in coverage.items():
        rows.append([fw, str(v["passing_controls"]), str(v["total_controls"]), f"{v['coverage_pct']}%"])
    t = Table(rows, colWidths=[1.6 * inch, 1.6 * inch, 1.6 * inch, 1.6 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.2),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D8DCE1")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#D8DCE1")),
    ]))
    return t


def build_executive_pdf(session: Session, dashboard: dict, top_n: int = 8) -> bytes:
    styles = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        topMargin=0.55 * inch, bottomMargin=0.55 * inch,
        leftMargin=0.6 * inch, rightMargin=0.6 * inch,
        title="SecureDrift AI — Executive Report",
    )

    story = []
    generated = dt.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    story.append(Paragraph("SecureDrift AI — Executive Security Posture Report", styles["H1Brand"]))
    story.append(Paragraph(
        f"Generated {generated} · Security control drift &amp; misconfiguration detection across "
        f"cloud, network, endpoint, and identity domains", styles["SubTitle"]))
    story.append(HRFlowable(width="100%", color=colors.HexColor("#D8DCE1"), thickness=0.75))
    story.append(Spacer(1, 10))

    story.append(Paragraph("Executive Summary", styles["SectionHeader"]))
    story.append(_kpi_table(dashboard, styles))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        f"Of {dashboard['total_controls']} monitored controls, {dashboard['passing_controls']} are "
        f"currently within their approved baseline. {dashboard['total_drift_events']} drift events have "
        f"been observed, of which {dashboard['suppressed_events']} ({dashboard['suppression_rate']}%) "
        f"were automatically suppressed as benign noise. {dashboard['ml_anomalies_flagged']} events were "
        f"additionally flagged by the unsupervised ML anomaly model.",
        styles["Body"]))
    story.append(Spacer(1, 4))

    story.append(Paragraph("Top Risk Incidents", styles["SectionHeader"]))
    incidents = (
        session.query(Incident)
        .order_by(Incident.total_risk_score.desc())
        .limit(top_n)
        .all()
    )
    if incidents:
        story.append(_incident_table(incidents, styles))
        story.append(Spacer(1, 6))
        top = incidents[0]
        if top.ai_root_cause:
            story.append(Paragraph(f"<b>{top.incident_id} — root cause:</b> {top.ai_root_cause}", styles["BodyMuted"]))
        if top.ai_mitre_technique:
            story.append(Paragraph(f"<b>MITRE ATT&amp;CK:</b> {top.ai_mitre_technique}", styles["BodyMuted"]))
    else:
        story.append(Paragraph("No correlated incidents in the current dataset.", styles["BodyMuted"]))

    story.append(Paragraph("Compliance Framework Coverage", styles["SectionHeader"]))
    coverage = compliance_coverage(session)
    story.append(_compliance_table(coverage))
    story.append(Spacer(1, 6))
    failing = currently_failing_control_ids(session)
    story.append(Paragraph(
        f"{len(failing)} controls are currently in a failing state across all frameworks combined. "
        f"Full per-event evidence, actor, and remediation history is available in the CSV audit export.",
        styles["BodyMuted"]))

    story.append(Spacer(1, 16))
    story.append(HRFlowable(width="100%", color=colors.HexColor("#D8DCE1"), thickness=0.75))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        "SecureDrift AI · Auto-generated report for internal audit and executive review. "
        "Not a substitute for a formal compliance attestation.", styles["BodyMuted"]))

    doc.build(story)
    buf.seek(0)
    return buf.read()
