import os
import csv
import io
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from supabase import create_client, Client
from threading import Lock
from functools import wraps

# Load environment variables
load_dotenv()

app = Flask(__name__)
# Enable CORS for development
CORS(app)

# Supabase Credentials
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing SUPABASE_URL or SUPABASE_KEY in environment variables.")

# Initialize Supabase Client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Global lock to serialize database read/write endpoints to prevent Supabase connection drops and dirty reads
db_lock = Lock()

def serialized_route(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        with db_lock:
            return f(*args, **kwargs)
    return decorated_function

@app.route("/", methods=["GET"])
def home():
    return jsonify({"status": "active", "message": "StrataPerform Backend API is running."})

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})

@app.route("/api/db", methods=["GET"])
@serialized_route
def get_db():
    try:
        # Fetch all tables concurrently/sequentially
        employees_res = supabase.table("employees").select("*").execute()
        goals_res = supabase.table("goals").select("*").execute()
        submissions_res = supabase.table("submissions").select("*").execute()
        achievements_res = supabase.table("achievements").select("*").execute()
        appraisals_res = supabase.table("appraisals").select("*").execute()
        cycles_res = supabase.table("appraisal_cycles").select("*").execute()
        complaints_res = supabase.table("complaints").select("*").execute()
        notifications_res = supabase.table("notifications").select("*").execute()
        scores_res = supabase.table("monthly_scores").select("*").execute()
        adjustments_res = supabase.table("manual_adjustments").select("*").execute()
        audit_res = supabase.table("audit_logs").select("*").execute()
        permissions_res = supabase.table("role_permissions").select("*").execute()
        badges_res = supabase.table("digital_badges").select("*").execute()
        recognitions_res = supabase.table("recognitions").select("*").execute()
        config_res = supabase.table("point_config").select("*").execute()

        # 1. Map Employees
        employees = []
        for e in employees_res.data:
            employees.append({
                "id": e["id"],
                "name": e["name"],
                "role": "MANAGEMENT" if e["role"] == "MANAGER" else e["role"],
                "department": e["department"],
                "email": e["email"],
                "credits": e["credits"],
                "compliance": e["compliance"],
                "isActive": e["is_active"],
                "managerId": e["manager_id"],
                "badges": e["badges"] or [],
                "empId": e.get("emp_id"),
                "password": e.get("password"),
                "isTempPassword": e.get("is_temp_password", False),
                "otpCode": e.get("otp_code"),
                "otpExpiry": e.get("otp_expiry"),
                "profilePicture": e.get("profile_picture")
            })

        # 2. Map Goals
        goals = []
        for g in goals_res.data:
            goals.append({
                "id": g["id"],
                "employeeId": g["employee_id"],
                "title": g["title"],
                "category": g["category"],
                "priority": g["priority"],
                "weightage": g["weightage"],
                "progress": g["progress"],
                "status": g["status"],
                "deadline": g["deadline"],
                "submissionDate": g["submission_date"],
                "history": g["history"] or [],
                "attachments": g["attachments"] or []
            })

        # 3. Map Submissions
        submissions = []
        for s in submissions_res.data:
            submissions.append({
                "id": s["id"],
                "employeeId": s["employee_id"],
                "weekStarting": s["week_starting"],
                "tasks": s["tasks"] or [],
                "achievements": s["achievements"] or [],
                "challenges": s["challenges"] or [],
                "status": s["status"],
                "managerFeedback": s["manager_feedback"],
                "attachments": s["attachments"] or [],
                "approvedAt": s["approved_at"]
            })

        # 4. Map Achievements
        achievements = []
        for a in achievements_res.data:
            achievements.append({
                "id": a["id"],
                "employeeId": a["employee_id"],
                "title": a["title"],
                "description": a["description"],
                "date": a["date"],
                "type": a["type"],
                "status": a["status"],
                "managerComment": a["manager_comment"],
                "weightage": a["weightage"],
                "attachments": a["attachments"] or [],
                "approvedAt": a["approved_at"]
            })

        # 5. Map Appraisals
        appraisals = []
        for ap in appraisals_res.data:
            appraisals.append({
                "id": ap["id"],
                "employeeId": ap["employee_id"],
                "cycleId": ap["cycle_id"],
                "step": ap["step"],
                "selfReview": ap["self_review"],
                "managerReview": ap["manager_review"],
                "hrReview": ap["hr_review"],
                "hikePercent": float(ap["hike_percent"]) if ap["hike_percent"] is not None else None,
                "promotionRecommended": ap["promotion_recommended"],
                "finalScore": ap["final_score"],
                "aiSummary": ap["ai_summary"],
                "insights": ap["insights"]
            })

        # 6. Map Appraisal Cycles
        appraisal_cycles = []
        for c in cycles_res.data:
            appraisal_cycles.append({
                "id": c["id"],
                "name": c["name"],
                "type": c["type"],
                "status": c["status"],
                "startDate": c["start_date"],
                "endDate": c["end_date"],
                "year": c["year"],
                "month": c["month"]
            })

        # 7. Map Complaints
        complaints = []
        for co in complaints_res.data:
            complaints.append({
                "id": co["id"],
                "employeeId": co["employee_id"],
                "title": co["title"],
                "description": co["description"],
                "type": co["type"],
                "penaltyPoints": co["penalty_points"],
                "date": co["date"],
                "status": co["status"],
                "nullificationComment": co["nullification_comment"]
            })

        # 8. Map Notifications
        notifications = []
        for n in notifications_res.data:
            notifications.append({
                "id": n["id"],
                "userId": n["user_id"],
                "title": n["title"],
                "message": n["message"],
                "type": n["type"],
                "read": n["read"],
                "date": n["date"]
            })

        # 9. Map Monthly Scores
        monthly_scores = []
        for sc in scores_res.data:
            monthly_scores.append({
                "id": sc["id"],
                "employeeId": sc["employee_id"],
                "cycleId": sc["cycle_id"],
                "score": sc["score"],
                "month": sc["month"],
                "year": sc["year"]
            })

        # 10. Map Manual Adjustments
        manual_adjustments = []
        for ad in adjustments_res.data:
            manual_adjustments.append({
                "id": ad["id"],
                "employeeId": ad["employee_id"],
                "type": ad["type"],
                "amount": ad["amount"],
                "reason": ad["reason"],
                "actorId": ad["actor_id"],
                "date": ad["date"]
            })

        # 11. Map Audit Logs
        audit_logs = []
        for al in audit_res.data:
            audit_logs.append({
                "id": al["id"],
                "action": al["action"],
                "actorId": al["actor_id"] or "system",
                "targetId": al["target_id"],
                "details": al["details"],
                "timestamp": al["timestamp"]
            })

        # 12. Map Permissions
        permissions = []
        for p in permissions_res.data:
            permissions.append({
                "role": "MANAGEMENT" if p["role"] == "MANAGER" else p["role"],
                "modules": p["modules"],
                "actions": p["actions"]
            })

        # 13. Map Badges
        badges = []
        for b in badges_res.data:
            badges.append({
                "id": b["id"],
                "name": b["name"],
                "description": b["description"],
                "icon": b["icon"],
                "color": b["color"]
            })

        # 14. Map Recognitions
        recognitions = []
        for r in recognitions_res.data:
            recognitions.append({
                "id": r["id"],
                "employeeId": r["employee_id"],
                "type": r["type"],
                "period": r["period"],
                "date": r["date"],
                "reason": r["reason"]
            })

        # 15. Map Point Config
        point_config = {
            "weeklySubmission": 5,
            "achievement": 10,
            "certification": 15
        }
        if len(config_res.data) > 0:
            cfg = config_res.data[0]
            point_config = {
                "weeklySubmission": cfg["weekly_submission"],
                "achievement": cfg["achievement"],
                "certification": cfg["certification"]
            }

        return jsonify({
            "employees": employees,
            "goals": goals,
            "submissions": submissions,
            "achievements": achievements,
            "appraisals": appraisals,
            "appraisalCycles": appraisal_cycles,
            "complaints": complaints,
            "notifications": notifications,
            "monthlyScores": monthly_scores,
            "manualAdjustments": manual_adjustments,
            "auditLogs": audit_logs,
            "permissions": permissions,
            "badges": badges,
            "recognitions": recognitions,
            "pointConfig": point_config
        })

    except Exception as e:
        print("GET /api/db Error:", str(e))
        return jsonify({"error": str(e)}), 500

@app.route("/api/db", methods=["POST"])
@serialized_route
def post_db():
    payload = request.json
    if not payload:
        return jsonify({"error": "No payload provided."}), 400

    # 1. Fetch current database state before doing anything
    backup_data = {}
    try:
        backup_data["digital_badges"] = supabase.table("digital_badges").select("*").execute().data or []
        backup_data["role_permissions"] = supabase.table("role_permissions").select("*").execute().data or []
        backup_data["point_config"] = supabase.table("point_config").select("*").execute().data or []
        backup_data["employees"] = supabase.table("employees").select("*").execute().data or []
        backup_data["appraisal_cycles"] = supabase.table("appraisal_cycles").select("*").execute().data or []
        backup_data["goals"] = supabase.table("goals").select("*").execute().data or []
        backup_data["submissions"] = supabase.table("submissions").select("*").execute().data or []
        backup_data["achievements"] = supabase.table("achievements").select("*").execute().data or []
        backup_data["appraisals"] = supabase.table("appraisals").select("*").execute().data or []
        backup_data["complaints"] = supabase.table("complaints").select("*").execute().data or []
        backup_data["notifications"] = supabase.table("notifications").select("*").execute().data or []
        backup_data["monthly_scores"] = supabase.table("monthly_scores").select("*").execute().data or []
        backup_data["manual_adjustments"] = supabase.table("manual_adjustments").select("*").execute().data or []
        backup_data["audit_logs"] = supabase.table("audit_logs").select("*").execute().data or []
        backup_data["recognitions"] = supabase.table("recognitions").select("*").execute().data or []
    except Exception as backup_err:
        print("Warning: Database backup failed:", str(backup_err))
        backup_data = {}

    try:
        # 2. Pre-validate and prepare data in-memory first to avoid KeyError/validation errors mid-execution
        badges_to_insert = []
        for b in payload.get("badges", []):
            badges_to_insert.append({
                "id": b["id"],
                "name": b["name"],
                "description": b["description"],
                "icon": b["icon"],
                "color": b["color"]
            })

        permissions_to_insert = []
        for p in payload.get("permissions", []):
            permissions_to_insert.append({
                "role": "MANAGER" if p["role"] == "MANAGEMENT" else p["role"],
                "modules": p["modules"],
                "actions": p["actions"]
            })

        cfg = payload.get("pointConfig", {})
        point_config_row = None
        if cfg:
            point_config_row = {
                "id": 1,
                "weekly_submission": cfg.get("weeklySubmission", 5),
                "achievement": cfg.get("achievement", 10),
                "certification": cfg.get("certification", 15)
            }

        employees_to_insert = []
        manager_mapping = {}
        for e in payload.get("employees", []):
            employees_to_insert.append({
                "id": e["id"],
                "name": e["name"],
                "role": "MANAGER" if e["role"] == "MANAGEMENT" else e["role"],
                "department": e["department"],
                "email": e["email"],
                "credits": e.get("credits", 500),
                "compliance": e.get("compliance", 100),
                "is_active": e.get("isActive", True),
                "manager_id": None,
                "badges": e.get("badges", []),
                "emp_id": e.get("empId"),
                "password": e.get("password"),
                "is_temp_password": e.get("isTempPassword", False),
                "otp_code": e.get("otpCode"),
                "otp_expiry": e.get("otpExpiry"),
                "profile_picture": e.get("profilePicture")
            })
            if e.get("managerId"):
                manager_mapping[e["id"]] = e["managerId"]

        cycles_to_insert = []
        for c in payload.get("appraisalCycles", []):
            cycles_to_insert.append({
                "id": c["id"],
                "name": c.get("name", c.get("id", "Unnamed Cycle")),
                "type": c["type"],
                "status": c["status"],
                "start_date": c["startDate"],
                "end_date": c["endDate"],
                "year": c["year"],
                "month": c.get("month")
            })

        goals_to_insert = []
        for g in payload.get("goals", []):
            goals_to_insert.append({
                "id": g["id"],
                "employee_id": g["employeeId"],
                "title": g["title"],
                "category": g["category"],
                "priority": g["priority"],
                "weightage": g["weightage"],
                "progress": g.get("progress", 0),
                "status": g["status"],
                "deadline": g["deadline"],
                "submission_date": g.get("submissionDate"),
                "history": g.get("history", []),
                "attachments": g.get("attachments", [])
            })

        submissions_to_insert = []
        for s in payload.get("submissions", []):
            submissions_to_insert.append({
                "id": s["id"],
                "employee_id": s["employeeId"],
                "week_starting": s["weekStarting"],
                "tasks": s.get("tasks", []),
                "achievements": s.get("achievements", []),
                "challenges": s.get("challenges", []),
                "status": s["status"],
                "manager_feedback": s.get("managerFeedback"),
                "attachments": s.get("attachments", []),
                "approved_at": s.get("approvedAt")
            })

        achievements_to_insert = []
        for a in payload.get("achievements", []):
            achievements_to_insert.append({
                "id": a["id"],
                "employee_id": a["employeeId"],
                "title": a["title"],
                "description": a.get("description"),
                "date": a["date"],
                "type": a["type"],
                "status": a["status"],
                "manager_comment": a.get("managerComment"),
                "weightage": a.get("weightage", 0),
                "attachments": a.get("attachments", []),
                "approved_at": a.get("approvedAt")
            })

        appraisals_to_insert = []
        for ap in payload.get("appraisals", []):
            appraisals_to_insert.append({
                "id": ap["id"],
                "employee_id": ap["employeeId"],
                "cycle_id": ap["cycleId"],
                "step": ap["step"],
                "self_review": ap.get("selfReview"),
                "manager_review": ap.get("managerReview"),
                "hr_review": ap.get("hrReview"),
                "hike_percent": ap.get("hikePercent"),
                "promotion_recommended": ap.get("promotionRecommended", False),
                "final_score": ap.get("finalScore", 0),
                "ai_summary": ap.get("aiSummary"),
                "insights": ap.get("insights")
            })

        complaints_to_insert = []
        for co in payload.get("complaints", []):
            complaints_to_insert.append({
                "id": co["id"],
                "employee_id": co["employeeId"],
                "title": co["title"],
                "description": co.get("description"),
                "type": co["type"],
                "penalty_points": co["penaltyPoints"],
                "date": co["date"],
                "status": co["status"],
                "nullification_comment": co.get("nullificationComment")
            })

        notifications_to_insert = []
        for n in payload.get("notifications", []):
            notifications_to_insert.append({
                "id": n["id"],
                "user_id": n["userId"],
                "title": n["title"],
                "message": n["message"],
                "type": n["type"],
                "read": n.get("read", False),
                "date": n["date"]
            })

        scores_to_insert = []
        for sc in payload.get("monthlyScores", []):
            scores_to_insert.append({
                "id": sc["id"],
                "employee_id": sc["employeeId"],
                "cycle_id": sc["cycleId"],
                "score": sc["score"],
                "month": sc["month"],
                "year": sc["year"]
            })

        adjustments_to_insert = []
        valid_emp_ids = {e["id"] for e in payload.get("employees", [])}
        for ad in payload.get("manualAdjustments", []):
            actor_id = ad.get("actorId")
            if actor_id not in valid_emp_ids:
                actor_id = None
            adjustments_to_insert.append({
                "id": ad["id"],
                "employee_id": ad["employeeId"],
                "type": ad["type"],
                "amount": ad["amount"],
                "reason": ad["reason"],
                "actor_id": actor_id,
                "date": ad["date"]
            })

        audit_to_insert = []
        for al in payload.get("auditLogs", []):
            actor_id = al.get("actorId")
            if actor_id not in valid_emp_ids:
                actor_id = None
            audit_to_insert.append({
                "id": al["id"],
                "action": al["action"],
                "actor_id": actor_id,
                "target_id": al["targetId"],
                "details": al["details"],
                "timestamp": al["timestamp"]
            })

        recognitions_to_insert = []
        for r in payload.get("recognitions", []):
            recognitions_to_insert.append({
                "id": r["id"],
                "employee_id": r["employeeId"],
                "type": r["type"],
                "period": r["period"],
                "date": r["date"],
                "reason": r["reason"]
            })

        # 3. Perform database operations (delete existing data first)
        supabase.table("submissions").delete().neq("id", "").execute()
        supabase.table("goals").delete().neq("id", "").execute()
        supabase.table("achievements").delete().neq("id", "").execute()
        supabase.table("appraisals").delete().neq("id", "").execute()
        supabase.table("complaints").delete().neq("id", "").execute()
        supabase.table("notifications").delete().neq("id", "").execute()
        supabase.table("monthly_scores").delete().neq("id", "").execute()
        supabase.table("appraisal_cycles").delete().neq("id", "").execute()
        supabase.table("manual_adjustments").delete().neq("id", "").execute()
        supabase.table("audit_logs").delete().neq("id", "").execute()
        supabase.table("recognitions").delete().neq("id", "").execute()
        supabase.table("employees").delete().neq("id", "").execute()
        supabase.table("point_config").delete().neq("id", "-1").execute()
        supabase.table("role_permissions").delete().neq("role", "").execute()
        supabase.table("digital_badges").delete().neq("id", "").execute()

        # Insert new data
        if badges_to_insert:
            supabase.table("digital_badges").insert(badges_to_insert).execute()
        if permissions_to_insert:
            supabase.table("role_permissions").insert(permissions_to_insert).execute()
        if point_config_row:
            supabase.table("point_config").insert(point_config_row).execute()
        if employees_to_insert:
            supabase.table("employees").insert(employees_to_insert).execute()
        if cycles_to_insert:
            supabase.table("appraisal_cycles").insert(cycles_to_insert).execute()
        if goals_to_insert:
            supabase.table("goals").insert(goals_to_insert).execute()
        if submissions_to_insert:
            supabase.table("submissions").insert(submissions_to_insert).execute()
        if achievements_to_insert:
            supabase.table("achievements").insert(achievements_to_insert).execute()
        if appraisals_to_insert:
            supabase.table("appraisals").insert(appraisals_to_insert).execute()
        if complaints_to_insert:
            supabase.table("complaints").insert(complaints_to_insert).execute()
        if notifications_to_insert:
            supabase.table("notifications").insert(notifications_to_insert).execute()
        if scores_to_insert:
            supabase.table("monthly_scores").insert(scores_to_insert).execute()
        if adjustments_to_insert:
            supabase.table("manual_adjustments").insert(adjustments_to_insert).execute()
        if audit_to_insert:
            supabase.table("audit_logs").insert(audit_to_insert).execute()
        if recognitions_to_insert:
            supabase.table("recognitions").insert(recognitions_to_insert).execute()

        # Employees 2nd Pass: Resolve and Update manager_ids
        for emp_id, mgr_id in manager_mapping.items():
            supabase.table("employees").update({"manager_id": mgr_id}).eq("id", emp_id).execute()

        # Compare notifications in payload with backup_data to detect newly created notifications
        old_notification_ids = {n["id"] for n in backup_data.get("notifications", [])}
        new_notifications = [n for n in payload.get("notifications", []) if n["id"] not in old_notification_ids]

        # Only send emails if backup_data is not empty (prevents false alerts on initial database seeds or resets)
        if backup_data.get("employees"):
            for n in new_notifications:
                user_id = n.get("userId")
                title = n.get("title")
                message = n.get("message")

                # Find recipient email and name in the updated employee list
                recipient = None
                for emp in payload.get("employees", []):
                    if emp["id"] == user_id:
                        recipient = emp
                        break

                if recipient and recipient.get("email"):
                    to_email = recipient["email"]
                    to_name = recipient.get("name", "User")

                    # Create dynamic HTML body
                    subject = f"StrataPerform: {title}"
                    html_content = f"""
                    <html>
                      <body style="font-family: Arial, sans-serif; color: #333; margin: 0; padding: 20px; background-color: #f8fafc;">
                        <div style="max-width: 600px; margin: 0 auto; padding: 30px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                          <h2 style="color: #4f46e5; border-bottom: 2px solid #f1f5f9; padding-bottom: 15px; margin-top: 0; font-size: 20px;">{title}</h2>
                          <p style="font-size: 15px; line-height: 1.6; color: #1e293b;">Hello {to_name},</p>
                          <p style="font-size: 15px; line-height: 1.6; color: #334155; background-color: #f8fafc; padding: 15px; border-radius: 12px; border-left: 4px solid #4f46e5;">
                            {message}
                          </p>
                          <p style="font-size: 14px; color: #64748b; margin-top: 25px;">
                            You can view the full details on your dashboard.
                          </p>
                          <div style="color: #94a3b8; font-size: 11px; border-top: 1px solid #f1f5f9; padding-top: 15px; margin-top: 30px; text-align: center;">
                            This is an automated system notification from StrataPerform. Please do not reply directly to this email.
                          </div>
                        </div>
                      </body>
                    </html>
                    """
                    try:
                        send_brevo_email(to_email, to_name, subject, html_content)
                    except Exception as email_err:
                        print("Warning: Failed to dispatch notification email:", str(email_err))

        return jsonify({"success": True})

    except Exception as e:
        print("POST /api/db Error:", str(e))
        # Trigger automatic database rollback if backup is available
        if backup_data:
            print("RESTORING DATABASE FROM IN-MEMORY BACKUP...")
            try:
                # Clear whatever was written
                supabase.table("submissions").delete().neq("id", "").execute()
                supabase.table("goals").delete().neq("id", "").execute()
                supabase.table("achievements").delete().neq("id", "").execute()
                supabase.table("appraisals").delete().neq("id", "").execute()
                supabase.table("complaints").delete().neq("id", "").execute()
                supabase.table("notifications").delete().neq("id", "").execute()
                supabase.table("monthly_scores").delete().neq("id", "").execute()
                supabase.table("appraisal_cycles").delete().neq("id", "").execute()
                supabase.table("manual_adjustments").delete().neq("id", "").execute()
                supabase.table("audit_logs").delete().neq("id", "").execute()
                supabase.table("recognitions").delete().neq("id", "").execute()
                supabase.table("employees").delete().neq("id", "").execute()
                supabase.table("point_config").delete().neq("id", "-1").execute()
                supabase.table("role_permissions").delete().neq("role", "").execute()
                supabase.table("digital_badges").delete().neq("id", "").execute()

                # Re-insert backup
                if backup_data.get("digital_badges"):
                    supabase.table("digital_badges").insert(backup_data["digital_badges"]).execute()
                if backup_data.get("role_permissions"):
                    supabase.table("role_permissions").insert(backup_data["role_permissions"]).execute()
                if backup_data.get("point_config"):
                    supabase.table("point_config").insert(backup_data["point_config"]).execute()
                
                employees_restore = []
                for emp in backup_data.get("employees", []):
                    emp_copy = dict(emp)
                    emp_copy["manager_id"] = None
                    employees_restore.append(emp_copy)
                if employees_restore:
                    supabase.table("employees").insert(employees_restore).execute()

                if backup_data.get("appraisal_cycles"):
                    supabase.table("appraisal_cycles").insert(backup_data["appraisal_cycles"]).execute()
                if backup_data.get("goals"):
                    supabase.table("goals").insert(backup_data["goals"]).execute()
                if backup_data.get("submissions"):
                    supabase.table("submissions").insert(backup_data["submissions"]).execute()
                if backup_data.get("achievements"):
                    supabase.table("achievements").insert(backup_data["achievements"]).execute()
                if backup_data.get("appraisals"):
                    supabase.table("appraisals").insert(backup_data["appraisals"]).execute()
                if backup_data.get("complaints"):
                    supabase.table("complaints").insert(backup_data["complaints"]).execute()
                if backup_data.get("notifications"):
                    supabase.table("notifications").insert(backup_data["notifications"]).execute()
                if backup_data.get("monthly_scores"):
                    supabase.table("monthly_scores").insert(backup_data["monthly_scores"]).execute()
                if backup_data.get("manual_adjustments"):
                    supabase.table("manual_adjustments").insert(backup_data["manual_adjustments"]).execute()
                if backup_data.get("audit_logs"):
                    supabase.table("audit_logs").insert(backup_data["audit_logs"]).execute()
                if backup_data.get("recognitions"):
                    supabase.table("recognitions").insert(backup_data["recognitions"]).execute()

                # Re-apply manager_id connections
                for emp in backup_data.get("employees", []):
                    if emp.get("manager_id"):
                        supabase.table("employees").update({"manager_id": emp["manager_id"]}).eq("id", emp["id"]).execute()
                print("DATABASE ROLLBACK COMPLETE.")
            except Exception as rollback_err:
                print("CRITICAL: DATABASE ROLLBACK FAILED:", str(rollback_err))
        return jsonify({"error": str(e)}), 500

import random
import datetime
import urllib.request
import json

def send_brevo_email(to_email, to_name, subject, html_content):
    api_key = os.getenv("BREVO_API_KEY")
    sender_email = os.getenv("BREVO_SENDER_EMAIL", "no-reply@strataperform.com")
    sender_name = os.getenv("BREVO_SENDER_NAME", "StrataPerform")

    if not api_key:
        print("*" * 60, flush=True)
        print("BREVO EMAIL SIMULATION ACTIVE (No API Key Configured)", flush=True)
        print(f"To: {to_name} <{to_email}>", flush=True)
        print(f"Subject: {subject}", flush=True)
        print("--- CONTENT ---", flush=True)
        print(html_content, flush=True)
        print("*" * 60, flush=True)
        return True

    url = "https://api.brevo.com/v3/smtp/email"
    headers = {
        "accept": "application/json",
        "api-key": api_key,
        "content-type": "application/json"
    }
    payload = {
        "sender": {
            "name": sender_name,
            "email": sender_email
        },
        "to": [
            {
                "email": to_email,
                "name": to_name
            }
        ],
        "subject": subject,
        "htmlContent": html_content
    }

    try:
        req = urllib.request.Request(
            url, 
            data=json.dumps(payload).encode('utf-8'), 
            headers=headers, 
            method="POST"
        )
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode('utf-8')
            print("Brevo Email Sent Success:", res_body)
            return True
    except Exception as e:
        print("Failed to send Brevo email:", str(e))
        return False

@app.route("/api/send-temp-password", methods=["POST"])
def api_send_temp_password():
    data = request.json
    if not data or not data.get("email") or not data.get("tempPassword"):
        return jsonify({"error": "Missing required fields."}), 400
    
    email = data.get("email")
    name = data.get("name", "User")
    temp_password = data.get("tempPassword")

    subject = "Welcome to StrataPerform - Your Temporary Password"
    html_content = f"""
    <html>
      <body style="font-family: Arial, sans-serif; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #4f46e5; border-bottom: 2px solid #f3f4f6; padding-bottom: 10px;">Welcome to StrataPerform</h2>
          <p>Hello {name},</p>
          <p>A new employee account has been created for you in StrataPerform.</p>
          <p>Please log in using the temporary credentials below:</p>
          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 16px; font-weight: bold; font-family: monospace; text-align: center;">
            Password: {temp_password}
          </div>
          <p style="color: #ef4444; font-weight: bold;">Important: You will be required to change your password immediately upon your first login.</p>
          <p>Regards,<br>StrataPerform Admin Team</p>
        </div>
      </body>
    </html>
    """
    
    success = send_brevo_email(email, name, subject, html_content)
    if success:
        return jsonify({"success": True})
    else:
        return jsonify({"error": "Failed to send welcome email."}), 500

@app.route("/api/forgot-password", methods=["POST"])
def api_forgot_password():
    data = request.json
    if not data or not data.get("email"):
        return jsonify({"error": "Email is required."}), 400
    
    email = data.get("email").strip()
    
    try:
        # Check if user exists in database
        res = supabase.table("employees").select("*").eq("email", email).execute()
        if not res.data:
            return jsonify({"error": "User with this email does not exist."}), 404
        
        emp = res.data[0]
        name = emp.get("name", "User")
        
        # Generate 6-digit OTP
        otp = f"{random.randint(100000, 999999)}"
        # Expiry set to 10 minutes in the future
        expiry = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=10)).isoformat()
        
        # Update database with OTP fields
        supabase.table("employees").update({
            "otp_code": otp,
            "otp_expiry": expiry
        }).eq("email", email).execute()
        
        # Send OTP email
        subject = f"Your Password Reset OTP: {otp}"
        html_content = f"""
        <html>
          <body style="font-family: Arial, sans-serif; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
              <h2 style="color: #4f46e5; border-bottom: 2px solid #f3f4f6; padding-bottom: 10px;">Reset Your Password</h2>
              <p>Hello {name},</p>
              <p>We received a request to reset your password for your StrataPerform account.</p>
              <p>Your 6-digit One-Time Password (OTP) is:</p>
              <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 24px; font-weight: bold; font-family: monospace; text-align: center; letter-spacing: 5px; color: #4f46e5;">
                {otp}
              </div>
              <p>This code will expire in 10 minutes. If you did not request a password reset, please ignore this email.</p>
              <p>Regards,<br>StrataPerform Security Team</p>
            </div>
          </body>
        </html>
        """
        
        send_brevo_email(email, name, subject, html_content)
        return jsonify({"success": True})
        
    except Exception as e:
        print("Forgot Password API error:", str(e))
        return jsonify({"error": str(e)}), 500

@app.route("/api/reset-password", methods=["POST"])
def api_reset_password():
    data = request.json
    if not data or not data.get("email") or not data.get("otp") or not data.get("newPassword"):
        return jsonify({"error": "Missing required fields."}), 400
    
    email = data.get("email").strip()
    otp = data.get("otp").strip()
    new_password = data.get("newPassword")
    
    try:
        # Check user in database
        res = supabase.table("employees").select("*").eq("email", email).execute()
        if not res.data:
            return jsonify({"error": "User with this email does not exist."}), 404
        
        emp = res.data[0]
        db_otp = emp.get("otp_code")
        db_expiry_str = emp.get("otp_expiry")
        
        if not db_otp or db_otp != otp:
            return jsonify({"error": "Invalid OTP code."}), 400
            
        if db_expiry_str:
            # Handle standard UTC timestamp formatting variations
            clean_ts = db_expiry_str.replace("Z", "+00:00")
            if "+" not in clean_ts and "-" not in clean_ts[-6:]:
                clean_ts += "+00:00"
            db_expiry = datetime.datetime.fromisoformat(clean_ts)
            now = datetime.datetime.now(datetime.timezone.utc)
            if now > db_expiry:
                return jsonify({"error": "OTP has expired."}), 400
        
        # Valid OTP. Update password, set is_temp_password = False, and clear OTP fields
        supabase.table("employees").update({
            "password": new_password,
            "is_temp_password": False,
            "otp_code": None,
            "otp_expiry": None
        }).eq("email", email).execute()
        
        return jsonify({"success": True})
        
    except Exception as e:
        print("Reset Password API error:", str(e))
        return jsonify({"error": str(e)}), 500

import urllib.parse
import urllib.request
import json

def get_ms_graph_token(tenant_id, client_id, client_secret):
    url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    }
    payload = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
        "scope": "https://graph.microsoft.com/.default"
    }
    data = urllib.parse.urlencode(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req) as response:
        res = json.loads(response.read().decode("utf-8"))
        return res["access_token"]

def download_sharepoint_file(token, user_email, item_id):
    url = f"https://graph.microsoft.com/v1.0/users/{user_email}/drive/items/{item_id}/content"
    headers = {
        "Authorization": f"Bearer {token}"
    }
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req) as response:
        return response.read().decode("utf-8-sig")

@app.route("/api/sync-sharepoint", methods=["POST"])
@serialized_route
def sync_sharepoint():
    tenant_id = os.getenv("AZURE_TENANT_ID")
    client_id = os.getenv("AZURE_CLIENT_ID")
    client_secret = os.getenv("AZURE_CLIENT_SECRET")
    user_email = os.getenv("SHAREPOINT_USER_EMAIL")
    item_id = os.getenv("SHAREPOINT_ITEM_ID")

    if not all([tenant_id, client_id, client_secret, user_email, item_id]):
        return jsonify({"error": "Missing SharePoint sync configuration in .env file."}), 400

    try:
        # 1. Get access token
        token = get_ms_graph_token(tenant_id, client_id, client_secret)

        # 2. Download file content
        csv_content = download_sharepoint_file(token, user_email, item_id)

        # 3. Parse CSV
        f = io.StringIO(csv_content)
        reader = csv.DictReader(f)

        rows = list(reader)
        if not rows:
            return jsonify({"success": True, "updated": 0, "message": "SharePoint CSV is empty."})

        # 4. Fetch current employees in database to match
        db_emps = supabase.table("employees").select("*").execute().data or []
        db_emp_ids = {e.get("emp_id"): e for e in db_emps if e.get("emp_id")}

        updated_count = 0
        inserted_count = 0
        import time
        import secrets
        import string

        current_time_ms = int(time.time() * 1000)
        alphabet = string.ascii_letters + string.digits

        for i, row in enumerate(rows):
            # We match by the employee ID column in the CSV: "crc6f_employeeid"
            emp_id = (row.get("crc6f_employeeid") or "").strip()
            if not emp_id:
                continue

            # Parse active status: "crc6f_activeflag"
            active_flag_val = (row.get("crc6f_activeflag") or "").strip().upper()
            is_active = active_flag_val == "TRUE"

            # Parse full name: "crc6f_firstname" and "crc6f_lastname"
            first_name = (row.get("crc6f_firstname") or "").strip()
            last_name = (row.get("crc6f_lastname") or "").strip()
            full_name = f"{first_name} {last_name}".strip()

            # Parse email: "crc6f_email"
            email = (row.get("crc6f_email") or "").strip()

            # Parse designation: "crc6f_designation"
            designation = (row.get("crc6f_designation") or "").strip()

            if emp_id in db_emp_ids:
                # Check if there are differences before updating
                db_emp = db_emp_ids[emp_id]
                needs_update = (
                    db_emp.get("is_active") != is_active or
                    db_emp.get("name") != full_name or
                    db_emp.get("email") != email or
                    db_emp.get("department") != designation
                )

                if needs_update:
                    supabase.table("employees").update({
                        "is_active": is_active,
                        "name": full_name,
                        "email": email,
                        "department": designation
                    }).eq("emp_id", emp_id).execute()
                    updated_count += 1
            else:
                # Insert new employee!
                new_id = f"e-{current_time_ms + i}"
                temp_pass = "".join(secrets.choice(alphabet) for _ in range(8)) + "!"
                
                supabase.table("employees").insert({
                    "id": new_id,
                    "emp_id": emp_id,
                    "name": full_name,
                    "email": email,
                    "department": designation,
                    "role": "EMPLOYEE",
                    "credits": 0,
                    "compliance": 0,
                    "is_active": is_active,
                    "password": temp_pass,
                    "is_temp_password": True,
                    "badges": [],
                    "profile_picture": ""
                }).execute()
                inserted_count += 1

        message = f"Successfully synced with SharePoint. Updated {updated_count} and inserted {inserted_count} employees."
        return jsonify({
            "success": True,
            "updated": updated_count,
            "inserted": inserted_count,
            "message": message
        })

    except Exception as e:
        print("SharePoint Sync Error:", str(e))
        return jsonify({"error": f"SharePoint Sync failed: {str(e)}"}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
