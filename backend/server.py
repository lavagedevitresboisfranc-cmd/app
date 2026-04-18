from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import resend

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Resend email config
resend.api_key = os.environ.get('RESEND_API_KEY', '')
NOTIFY_EMAIL = os.environ.get('NOTIFY_EMAIL', '')

app = FastAPI()
api_router = APIRouter(prefix="/api")

# --- Models ---

class AppointmentCreate(BaseModel):
    title: str
    client_name: str
    client_email: Optional[str] = ""
    client_phone: Optional[str] = ""
    client_address: Optional[str] = ""
    date: str  # YYYY-MM-DD
    time_slot: str  # HH:MM
    duration_minutes: int = 30
    price: Optional[float] = 0.0
    notes: Optional[str] = ""
    status: str = "upcoming"  # upcoming, completed, cancelled

class AppointmentUpdate(BaseModel):
    title: Optional[str] = None
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    client_address: Optional[str] = None
    date: Optional[str] = None
    time_slot: Optional[str] = None
    duration_minutes: Optional[int] = None
    price: Optional[float] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    client_photo: Optional[str] = None

class AppointmentResponse(BaseModel):
    id: str
    title: str
    client_name: str
    client_email: str = ""
    client_phone: str = ""
    client_address: str = ""
    date: str
    time_slot: str
    duration_minutes: int
    price: float = 0.0
    notes: str
    status: str
    created_at: str
    assigned_to: Optional[str] = None
    assigned_id: Optional[str] = None
    assigned_color: Optional[str] = None
    client_photo: Optional[str] = None

# --- Request Models ---

class RequestCreate(BaseModel):
    customer_name: str
    customer_email: str
    customer_phone: Optional[str] = ""
    customer_address: Optional[str] = ""
    preferred_date: str  # YYYY-MM-DD
    preferred_time: str  # HH:MM
    message: Optional[str] = ""
    request_type: Optional[str] = "rdv"  # 'rdv' or 'est'

class RequestSuggest(BaseModel):
    suggested_date: str
    suggested_time: str
    note: Optional[str] = ""

class RequestResponse(BaseModel):
    id: str
    customer_name: str
    customer_email: str
    customer_phone: str
    customer_address: str
    preferred_date: str
    preferred_time: str
    message: str
    status: str  # pending, accepted, alternative_offered, declined
    suggested_date: Optional[str] = None
    suggested_time: Optional[str] = None
    suggested_note: Optional[str] = None
    created_at: str
    request_type: Optional[str] = "rdv"


# --- Voice Transcription ---

@api_router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """Transcribe audio to text using OpenAI Whisper"""
    import tempfile
    from emergentintegrations.llm.openai import OpenAISpeechToText

    api_key = os.environ.get('EMERGENT_LLM_KEY', '')
    if not api_key:
        raise HTTPException(status_code=400, detail="API key not configured")

    try:
        # Save uploaded file to temp
        suffix = ".m4a"
        if file.filename:
            suffix = "." + file.filename.split(".")[-1]
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        stt = OpenAISpeechToText(api_key=api_key)
        with open(tmp_path, "rb") as audio_file:
            response = await stt.transcribe(
                file=audio_file,
                model="whisper-1",
                language="fr",
                response_format="json",
                prompt="Ceci est une prise de rendez-vous. Le client donne son nom, téléphone, adresse et détails du service.",
            )

        os.unlink(tmp_path)
        return {"text": response.text}
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur de transcription: {str(e)}")


# --- Booking Page (for customers) ---

@api_router.get("/booking", response_class=HTMLResponse)
async def booking_page():
    """Public booking page for customers to request appointments"""
    html_path = ROOT_DIR / "booking.html"
    content = html_path.read_text()
    # Inject the backend API URL so form submits to BrightCalendar even when embedded on external sites
    app_url = os.environ.get("APP_URL", "").rstrip("/")
    content = content.replace("window.location.origin", f'"{app_url}"')
    return HTMLResponse(content=content)


@api_router.get("/booking-qr")
async def booking_qr_code():
    """Generate a QR code pointing to the booking page"""
    import qrcode
    from fastapi.responses import Response
    from io import BytesIO

    app_url = os.environ.get("APP_URL", "").rstrip("/")
    booking_url = f"{app_url}/api/booking"

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=12,
        border=4,
    )
    qr.add_data(booking_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return Response(content=buf.getvalue(), media_type="image/png", headers={
        "Content-Disposition": 'inline; filename="brightcalendar-qr.png"'
    })


@api_router.get("/booking-qr-page", response_class=HTMLResponse)
async def booking_qr_page():
    """A printable page with the QR code + instructions"""
    app_url = os.environ.get("APP_URL", "").rstrip("/")
    qr_url = f"{app_url}/api/booking-qr"
    booking_url = f"{app_url}/api/booking"
    html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>QR Code — Prendre rendez-vous</title>
<style>
*{{box-sizing:border-box;}}body{{font-family:-apple-system,'Segoe UI',sans-serif;max-width:600px;margin:40px auto;padding:30px;text-align:center;color:#1F2937;}}
.card{{background:linear-gradient(135deg,#0891B2 0%,#06B6D4 100%);color:#FFF;padding:40px 30px;border-radius:24px;box-shadow:0 10px 40px rgba(0,0,0,0.1);}}
h1{{margin:0 0 8px 0;font-size:28px;}}
.tagline{{font-size:14px;opacity:0.9;margin-bottom:24px;text-transform:uppercase;letter-spacing:2px;}}
.qr-wrap{{background:#FFF;padding:20px;border-radius:20px;display:inline-block;margin:16px 0;}}
.qr-wrap img{{display:block;width:260px;height:260px;}}
.cta{{font-size:22px;font-weight:800;margin:20px 0 6px 0;}}
.hint{{font-size:13px;opacity:0.9;}}
.contact{{background:#FFF;color:#0A0A0A;border-radius:16px;padding:20px;margin-top:24px;font-size:14px;line-height:1.8;}}
.contact strong{{color:#0891B2;}}
.url-fallback{{margin-top:20px;font-size:11px;color:#737373;word-break:break-all;}}
@media print{{body{{margin:0;padding:20px;}}.card{{box-shadow:none;-webkit-print-color-adjust:exact;print-color-adjust:exact;}}}}
</style></head><body>
<div class="card">
  <div class="tagline">Lavage de Vitres Bois-Franc</div>
  <h1>📅 Prenez rendez-vous</h1>
  <div class="qr-wrap"><img src="{qr_url}" alt="QR Code"/></div>
  <div class="cta">Scannez avec votre téléphone</div>
  <div class="hint">Ouvrez l'appareil photo et pointez-le vers le QR code</div>
</div>
<div class="contact">
  <strong>☎ 514-570-9802</strong><br>
  ✉ lavagedevitreboisfranc@live.com<br>
  🌐 Lavagedevitre.org
</div>
<div class="url-fallback">Ou visitez: {booking_url}</div>
</body></html>"""
    return HTMLResponse(content=html)

# --- Routes ---

@api_router.get("/")
async def root():
    return {"message": "Appointment Manager API"}

@api_router.post("/appointments", response_model=AppointmentResponse)
async def create_appointment(data: AppointmentCreate):
    appointment = {
        "id": str(uuid.uuid4()),
        "title": data.title,
        "client_name": data.client_name,
        "client_email": data.client_email or "",
        "client_phone": data.client_phone or "",
        "client_address": data.client_address or "",
        "date": data.date,
        "time_slot": data.time_slot,
        "duration_minutes": data.duration_minutes,
        "price": data.price or 0.0,
        "notes": data.notes or "",
        "status": data.status,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.appointments.insert_one(appointment)
    return AppointmentResponse(**{k: v for k, v in appointment.items() if k != "_id"})

@api_router.get("/appointments", response_model=List[AppointmentResponse])
async def get_appointments(date: Optional[str] = None, status: Optional[str] = None):
    query = {}
    if date:
        query["date"] = date
    if status:
        query["status"] = status
    appointments = await db.appointments.find(query, {"_id": 0}).sort("date", 1).to_list(1000)
    return [AppointmentResponse(**a) for a in appointments]

@api_router.get("/appointments/{appointment_id}", response_model=AppointmentResponse)
async def get_appointment(appointment_id: str):
    appointment = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return AppointmentResponse(**appointment)

@api_router.put("/appointments/{appointment_id}", response_model=AppointmentResponse)
async def update_appointment(appointment_id: str, data: AppointmentUpdate):
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.appointments.update_one({"id": appointment_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Appointment not found")
    appointment = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    return AppointmentResponse(**appointment)

@api_router.delete("/appointments/{appointment_id}")
async def delete_appointment(appointment_id: str):
    result = await db.appointments.delete_one({"id": appointment_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Appointment not found")
    return {"message": "Appointment deleted"}

# --- Request Routes (public + admin) ---

@api_router.post("/requests", response_model=RequestResponse)
async def create_request(data: RequestCreate):
    """Public endpoint: customers submit appointment requests from website"""
    request_doc = {
        "id": str(uuid.uuid4()),
        "customer_name": data.customer_name,
        "customer_email": data.customer_email,
        "customer_phone": data.customer_phone or "",
        "customer_address": data.customer_address or "",
        "preferred_date": data.preferred_date,
        "preferred_time": data.preferred_time,
        "message": data.message or "",
        "status": "pending",
        "suggested_date": None,
        "suggested_time": None,
        "suggested_note": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.appointment_requests.insert_one(request_doc)

    # Send email notification
    if NOTIFY_EMAIL and resend.api_key:
        try:
            html = f"""
            <div style="font-family:-apple-system,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
                <h2 style="color:#0A0A0A;margin-bottom:4px;">Nouvelle demande de rendez-vous</h2>
                <hr style="border:none;border-top:1px solid #E5E5E5;margin:16px 0;">
                <table style="width:100%;border-collapse:collapse;">
                    <tr><td style="padding:8px 0;color:#737373;font-size:13px;font-weight:600;">NOM</td></tr>
                    <tr><td style="padding:0 0 12px;font-size:16px;color:#0A0A0A;">{request_doc['customer_name']}</td></tr>
                    <tr><td style="padding:8px 0;color:#737373;font-size:13px;font-weight:600;">COURRIEL</td></tr>
                    <tr><td style="padding:0 0 12px;font-size:16px;color:#0A0A0A;">{request_doc['customer_email']}</td></tr>
                    <tr><td style="padding:8px 0;color:#737373;font-size:13px;font-weight:600;">TÉLÉPHONE</td></tr>
                    <tr><td style="padding:0 0 12px;font-size:16px;color:#0A0A0A;">{request_doc['customer_phone']}</td></tr>
                    <tr><td style="padding:8px 0;color:#737373;font-size:13px;font-weight:600;">ADRESSE</td></tr>
                    <tr><td style="padding:0 0 12px;font-size:16px;color:#0A0A0A;">{request_doc['customer_address']}</td></tr>
                    <tr><td style="padding:8px 0;color:#737373;font-size:13px;font-weight:600;">DATE ET HEURE</td></tr>
                    <tr><td style="padding:0 0 12px;font-size:16px;color:#0A0A0A;">{request_doc['preferred_date']} à {request_doc['preferred_time']}</td></tr>
                </table>
                <hr style="border:none;border-top:1px solid #E5E5E5;margin:16px 0;">
                <p style="color:#A3A3A3;font-size:13px;">Ouvrez votre app pour accepter ou proposer un autre horaire.</p>
            </div>
            """
            await asyncio.to_thread(resend.Emails.send, {
                "from": "onboarding@resend.dev",
                "to": [NOTIFY_EMAIL],
                "subject": f"Nouveau RDV — {request_doc['customer_name']}",
                "html": html,
            })
            logger.info(f"Email notification sent to {NOTIFY_EMAIL}")
        except Exception as e:
            logger.error(f"Failed to send email notification: {e}")

    return RequestResponse(**{k: v for k, v in request_doc.items() if k != "_id"})

@api_router.get("/requests", response_model=List[RequestResponse])
async def get_requests(status: Optional[str] = None):
    query = {}
    if status:
        query["status"] = status
    requests = await db.appointment_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [RequestResponse(**r) for r in requests]

@api_router.get("/requests/{request_id}", response_model=RequestResponse)
async def get_request(request_id: str):
    req = await db.appointment_requests.find_one({"id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    return RequestResponse(**req)

class AcceptRequest(BaseModel):
    price: Optional[float] = 0.0

@api_router.put("/requests/{request_id}/accept", response_model=AppointmentResponse)
async def accept_request(request_id: str, data: AcceptRequest = AcceptRequest()):
    """Accept a request: creates a confirmed appointment and marks request as accepted"""
    req = await db.appointment_requests.find_one({"id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req["status"] == "accepted":
        raise HTTPException(status_code=400, detail="Request already accepted")

    # Create appointment from request
    appointment = {
        "id": str(uuid.uuid4()),
        "title": f"Meeting with {req['customer_name']}",
        "client_name": req["customer_name"],
        "client_email": req.get("customer_email", ""),
        "client_phone": req.get("customer_phone", ""),
        "client_address": req.get("customer_address", ""),
        "date": req["preferred_date"],
        "time_slot": req["preferred_time"],
        "duration_minutes": 30,
        "price": data.price or 0.0,
        "notes": req.get("message", ""),
        "status": "upcoming",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.appointments.insert_one(appointment)

    # Mark request as accepted
    await db.appointment_requests.update_one(
        {"id": request_id},
        {"$set": {"status": "accepted"}}
    )

    return AppointmentResponse(**{k: v for k, v in appointment.items() if k != "_id"})

@api_router.put("/requests/{request_id}/suggest", response_model=RequestResponse)
async def suggest_alternative(request_id: str, data: RequestSuggest):
    """Suggest an alternative date/time for a request"""
    req = await db.appointment_requests.find_one({"id": request_id}, {"_id": 0})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    await db.appointment_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": "alternative_offered",
            "suggested_date": data.suggested_date,
            "suggested_time": data.suggested_time,
            "suggested_note": data.note or "",
        }}
    )

    updated = await db.appointment_requests.find_one({"id": request_id}, {"_id": 0})
    return RequestResponse(**updated)

@api_router.delete("/requests/{request_id}")
async def decline_request(request_id: str):
    """Decline/delete a request"""
    result = await db.appointment_requests.delete_one({"id": request_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Request not found")
    return {"message": "Request declined and removed"}

@api_router.get("/requests/count/pending")
async def get_pending_count():
    count = await db.appointment_requests.count_documents({"status": "pending"})
    return {"count": count}


# --- Statistics & Client History ---

@api_router.get("/stats")
async def get_stats():
    """Dashboard statistics"""
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    
    # Current month range
    month_start = now.strftime("%Y-%m-01")
    month_end = now.strftime("%Y-%m-31")
    
    # Total appointments
    total_appointments = await db.appointments.count_documents({})
    
    # This month appointments
    month_appointments = await db.appointments.count_documents({
        "date": {"$gte": month_start, "$lte": month_end}
    })
    
    # Today appointments
    today_appointments = await db.appointments.count_documents({"date": today})
    
    # Total revenue (all time)
    pipeline_revenue = [
        {"$group": {"_id": None, "total": {"$sum": "$price"}}}
    ]
    revenue_result = await db.appointments.aggregate(pipeline_revenue).to_list(1)
    total_revenue = revenue_result[0]["total"] if revenue_result else 0
    
    # Month revenue
    pipeline_month_rev = [
        {"$match": {"date": {"$gte": month_start, "$lte": month_end}}},
        {"$group": {"_id": None, "total": {"$sum": "$price"}}}
    ]
    month_rev_result = await db.appointments.aggregate(pipeline_month_rev).to_list(1)
    month_revenue = month_rev_result[0]["total"] if month_rev_result else 0
    
    # Pending requests
    pending_requests = await db.appointment_requests.count_documents({"status": "pending"})
    total_requests = await db.appointment_requests.count_documents({})
    accepted_requests = await db.appointment_requests.count_documents({"status": "accepted"})
    acceptance_rate = round((accepted_requests / total_requests * 100), 1) if total_requests > 0 else 0
    
    # Top clients (by appointment count)
    pipeline_clients = [
        {"$group": {"_id": "$client_name", "count": {"$sum": 1}, "total_spent": {"$sum": "$price"}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    top_clients = await db.appointments.aggregate(pipeline_clients).to_list(10)
    
    # Completed vs upcoming
    completed = await db.appointments.count_documents({"status": "completed"})
    upcoming = await db.appointments.count_documents({"status": "upcoming"})
    cancelled = await db.appointments.count_documents({"status": "cancelled"})
    
    return {
        "total_appointments": total_appointments,
        "month_appointments": month_appointments,
        "today_appointments": today_appointments,
        "total_revenue": total_revenue,
        "month_revenue": month_revenue,
        "pending_requests": pending_requests,
        "acceptance_rate": acceptance_rate,
        "completed": completed,
        "upcoming": upcoming,
        "cancelled": cancelled,
        "top_clients": [
            {"name": c["_id"], "count": c["count"], "total_spent": c.get("total_spent", 0)}
            for c in top_clients if c["_id"]
        ],
    }

@api_router.get("/clients")
async def get_clients():
    """List all unique clients with stats"""
    pipeline = [
        {"$group": {
            "_id": "$client_name",
            "count": {"$sum": 1},
            "total_spent": {"$sum": "$price"},
            "last_visit": {"$max": "$date"},
            "email": {"$first": "$client_email"},
            "phone": {"$first": "$client_phone"},
            "address": {"$first": "$client_address"},
        }},
        {"$sort": {"last_visit": -1}},
    ]
    clients = await db.appointments.aggregate(pipeline).to_list(500)
    return [
        {
            "name": c["_id"],
            "count": c["count"],
            "total_spent": c.get("total_spent", 0),
            "last_visit": c.get("last_visit", ""),
            "email": c.get("email", ""),
            "phone": c.get("phone", ""),
            "address": c.get("address", ""),
        }
        for c in clients if c["_id"]
    ]

@api_router.get("/clients/{client_name}/history")
async def get_client_history(client_name: str):
    """Get all appointments for a specific client"""
    appointments = await db.appointments.find(
        {"client_name": client_name}, {"_id": 0}
    ).sort("date", -1).to_list(500)
    return [AppointmentResponse(**a) for a in appointments]


@api_router.post("/requests/seed")



# --- Employees ---

class EmployeeCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    email: Optional[str] = ""
    color: Optional[str] = "#0891B2"

class EmployeeResponse(BaseModel):
    id: str
    name: str
    phone: str
    email: str
    color: str
    active: bool
    created_at: str

@api_router.post("/employees", response_model=EmployeeResponse)
async def create_employee(data: EmployeeCreate):
    emp = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "phone": data.phone or "",
        "email": data.email or "",
        "color": data.color or "#0891B2",
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.employees.insert_one(emp)
    return EmployeeResponse(**{k: v for k, v in emp.items() if k != "_id"})

@api_router.get("/employees", response_model=List[EmployeeResponse])
async def get_employees():
    emps = await db.employees.find({"active": True}, {"_id": 0}).sort("name", 1).to_list(100)
    return [EmployeeResponse(**e) for e in emps]

@api_router.delete("/employees/{employee_id}")
async def delete_employee(employee_id: str):
    await db.employees.update_one({"id": employee_id}, {"$set": {"active": False}})
    return {"message": "Employé désactivé"}

@api_router.put("/appointments/{appointment_id}/assign")
async def assign_employee(appointment_id: str, employee_id: str):
    """Assign an employee to an appointment (or pass 'none' to unassign)"""
    if employee_id == "none":
        result = await db.appointments.update_one(
            {"id": appointment_id},
            {"$unset": {"assigned_to": "", "assigned_id": "", "assigned_color": ""}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="RDV non trouvé")
        appt = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
        return AppointmentResponse(**appt)
    emp = await db.employees.find_one({"id": employee_id}, {"_id": 0})
    if not emp:
        raise HTTPException(status_code=404, detail="Employé non trouvé")
    result = await db.appointments.update_one(
        {"id": appointment_id},
        {"$set": {"assigned_to": emp["name"], "assigned_id": employee_id, "assigned_color": emp.get("color", "#0891B2")}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="RDV non trouvé")
    appt = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    return AppointmentResponse(**appt)

@api_router.get("/employees/{employee_id}/schedule")
async def get_employee_schedule(employee_id: str, date: Optional[str] = None):
    """Get appointments assigned to an employee"""
    query = {"assigned_id": employee_id}
    if date:
        query["date"] = date
    appts = await db.appointments.find(query, {"_id": 0}).sort("date", 1).to_list(500)
    return [AppointmentResponse(**a) for a in appts]


async def _build_backup_data():
    """Return all DB data as a plain dict (used by export endpoint + scheduler)."""
    data = {
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "version": 1,
        "appointments": [],
        "requests": [],
        "employees": [],
        "reviews": [],
    }
    async for d in db.appointments.find({}, {"_id": 0}):
        data["appointments"].append(d)
    async for d in db.appointment_requests.find({}, {"_id": 0}):
        data["requests"].append(d)
    async for d in db.employees.find({}, {"_id": 0}):
        data["employees"].append(d)
    async for d in db.reviews.find({}, {"_id": 0}):
        data["reviews"].append(d)
    return data


@api_router.get("/backup/export")
async def export_backup():
    """Export all data as JSON for backup"""
    return await _build_backup_data()


async def _create_auto_backup():
    """Creates a backup document and keeps only last 2."""
    try:
        data = await _build_backup_data()
        backup_doc = {
            "id": str(uuid.uuid4()),
            "created_at": datetime.utcnow().isoformat() + "Z",
            "type": "auto",
            "data": data,
            "stats": {
                "appointments": len(data.get("appointments", [])),
                "requests": len(data.get("requests", [])),
                "employees": len(data.get("employees", [])),
                "reviews": len(data.get("reviews", [])),
            },
        }
        await db.backups.insert_one(backup_doc)
        # Keep only 2 most recent automatic backups
        cursor = db.backups.find({"type": "auto"}, {"_id": 1, "created_at": 1}).sort("created_at", -1)
        all_backups = [b async for b in cursor]
        for old in all_backups[2:]:
            await db.backups.delete_one({"_id": old["_id"]})
        logger.info(f"Auto backup created. Kept {min(len(all_backups), 2)} backups.")
    except Exception as e:
        logger.error(f"Auto backup failed: {e}")


@api_router.get("/backup/list")
async def list_backups():
    """List stored automatic backups."""
    cursor = db.backups.find({}, {"_id": 0, "data": 0}).sort("created_at", -1)
    return [b async for b in cursor]


@api_router.post("/backup/run-now")
async def run_backup_now():
    """Trigger a backup immediately (manual trigger)."""
    await _create_auto_backup()
    return {"status": "ok", "message": "Backup created"}


@api_router.get("/backup/download/{backup_id}")
async def download_backup(backup_id: str):
    """Download a specific stored backup as JSON."""
    b = await db.backups.find_one({"id": backup_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Backup non trouvé")
    return b.get("data", {})


@api_router.post("/backup/import")
async def import_backup(body: dict):
    """Import/restore data from a backup JSON. Upserts based on id field."""
    results = {"appointments": 0, "requests": 0, "employees": 0, "reviews": 0}
    for coll_key, coll_name in [
        ("appointments", "appointments"),
        ("requests", "appointment_requests"),
        ("employees", "employees"),
        ("reviews", "reviews"),
    ]:
        items = body.get(coll_key, [])
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            item_id = item.get("id")
            if not item_id:
                continue
            await db[coll_name].update_one({"id": item_id}, {"$set": item}, upsert=True)
            results[coll_key] += 1
    return {"status": "ok", "imported": results}


@api_router.get("/clients/emails")
async def get_client_emails():
    """Get unique client emails for email campaigns"""
    cursor = db.appointments.find({"client_email": {"$nin": [None, ""]}}, {"_id": 0, "client_email": 1, "client_name": 1, "client_phone": 1, "date": 1})
    seen = {}
    async for doc in cursor:
        email = (doc.get("client_email") or "").strip().lower()
        if not email or email in seen:
            continue
        seen[email] = {
            "email": doc.get("client_email"),
            "name": doc.get("client_name", ""),
            "phone": doc.get("client_phone", ""),
            "last_visit": doc.get("date", ""),
        }
    return list(seen.values())


# --- Invoice PDF ---

@api_router.get("/invoice/{appointment_id}")
async def generate_invoice(appointment_id: str):
    """Generate printable invoice for an appointment"""
    from fastapi.responses import HTMLResponse
    appt = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    invoice_num = appointment_id[:8].upper()
    price = appt.get('price', 0)
    logo_url = os.environ.get('INVOICE_LOGO_URL', 'https://customer-assets.emergentagent.com/job_booking-hub-406/artifacts/kwu8xdcw_logo.jpg')

    # Seasonal promo: 10% automne (sept-nov)
    from datetime import datetime
    try:
        appt_date = datetime.strptime(appt.get('date', ''), '%Y-%m-%d')
    except Exception:
        appt_date = datetime.now()
    is_autumn = 9 <= appt_date.month <= 11
    promo_banner_html = ""
    if is_autumn:
        promo_banner_html = """
<div style="background:linear-gradient(135deg,#F59E0B 0%,#DC2626 100%);color:#FFF;padding:14px 20px;border-radius:12px;margin:16px 0;text-align:center;box-shadow:0 4px 12px rgba(245,158,11,0.3);-webkit-print-color-adjust:exact;print-color-adjust:exact;">
  <div style="font-size:11px;letter-spacing:2px;font-weight:700;opacity:0.95;">🍂 PROMO AUTOMNE 🍂</div>
  <div style="font-size:22px;font-weight:800;margin-top:4px;">-10% sur votre prochain lavage</div>
  <div style="font-size:11px;margin-top:6px;opacity:0.95;">Valide jusqu'au 30 novembre • Mentionnez ce code: AUTOMNE10</div>
</div>
"""

    html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Facture {invoice_num}</title>
<style>
@page{{size:letter;margin:0;}}
*{{box-sizing:border-box;}}
html,body{{margin:0;padding:0;}}
body{{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;max-width:780px;margin:0 auto;padding:22px 28px;color:#1F2937;font-size:12px;background:#FFFFFF;}}
.top-banner{{background:linear-gradient(135deg,#0891B2 0%,#06B6D4 100%);height:6px;border-radius:3px;margin-bottom:14px;}}
.header{{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-bottom:16px;padding-bottom:14px;border-bottom:2px solid #F3F4F6;}}
.brand{{display:flex;align-items:center;gap:14px;flex:1;}}
.brand img{{width:140px;height:140px;border-radius:14px;object-fit:cover;box-shadow:0 3px 10px rgba(0,0,0,0.08);}}
.brand-info{{display:flex;flex-direction:column;gap:2px;}}
.company-name{{font-size:14px;font-weight:700;color:#111827;line-height:1.25;}}
.company-tagline{{font-size:9px;color:#6B7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;}}
.company-contact{{font-size:11px;color:#6B7280;line-height:1.6;margin-top:6px;}}
.company-contact strong{{color:#0891B2;font-weight:600;}}
.invoice-block{{text-align:right;flex-shrink:0;}}
.invoice-title{{font-size:26px;font-weight:800;color:#0891B2;letter-spacing:-1px;line-height:1;}}
.invoice-meta{{font-size:11px;color:#6B7280;margin-top:6px;line-height:1.5;}}
.invoice-meta strong{{color:#111827;font-weight:600;}}
.greeting{{font-size:12px;color:#374151;margin-bottom:12px;line-height:1.5;}}
.greeting .name{{font-weight:700;color:#0891B2;}}
.card{{background:#F9FAFB;border-radius:10px;padding:12px 16px;margin-bottom:12px;border-left:4px solid #0891B2;}}
.card-title{{font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;}}
.client-grid{{display:grid;grid-template-columns:auto 1fr;gap:4px 16px;}}
.client-grid .lbl{{color:#9CA3AF;font-size:11px;}}
.client-grid .val{{color:#111827;font-weight:500;font-size:12px;}}
.service-table{{width:100%;border-collapse:collapse;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);margin-bottom:12px;}}
.service-table thead th{{background:#0891B2;color:#FFF;padding:10px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;}}
.service-table thead th:last-child{{text-align:right;}}
.service-table tbody td{{padding:12px 14px;background:#FFFFFF;border-bottom:1px solid #F3F4F6;font-size:12px;}}
.service-table tbody td:last-child{{text-align:right;font-weight:600;}}
.total-row td{{background:#F0F9FF!important;padding:14px!important;font-size:17px!important;font-weight:800;color:#0891B2;border-bottom:none!important;}}
.notes-card{{background:#FFFBEB;border-left-color:#F59E0B;padding:10px 16px;}}
.notes-card .card-title{{color:#92400E;}}
.notes-card p{{color:#78350F;line-height:1.4;margin:0;font-size:11px;}}
.thankyou{{text-align:center;padding:14px 16px;margin-top:12px;background:#F0F9FF;border-radius:12px;}}
.thankyou h3{{color:#0891B2;font-size:14px;margin:0 0 4px 0;font-weight:700;}}
.thankyou p{{color:#374151;font-size:11px;margin:0;line-height:1.4;}}
.footer{{margin-top:14px;padding-top:10px;border-top:1px solid #F3F4F6;text-align:center;color:#9CA3AF;font-size:10px;line-height:1.5;}}
.footer strong{{color:#0891B2;}}
@media print{{
  body{{padding:20px 28px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
  .top-banner,.service-table thead th,.total-row td,.card,.thankyou{{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
  .page{{page-break-after:avoid;page-break-inside:avoid;}}
}}
</style></head><body>

<div class="page">
<div class="top-banner"></div>

<div class="header">
  <div class="brand">
    <img src="{logo_url}" alt="Logo" />
    <div class="brand-info">
      <div class="company-tagline">Lavage professionnel</div>
      <div class="company-name">Lavage de Vitres<br>Bois-Franc</div>
      <div class="company-contact">
        <strong>☎</strong> 514-570-9802<br>
        <strong>✉</strong> lavagedevitreboisfranc@live.com<br>
        <strong>🌐</strong> Lavagedevitre.org
      </div>
    </div>
  </div>
  <div class="invoice-block">
    <div class="invoice-title">FACTURE</div>
    <div class="invoice-meta">
      <strong>N°</strong> {invoice_num}<br>
      <strong>Date:</strong> {appt.get('date','')}
    </div>
  </div>
</div>

<div class="greeting">
  Bonjour <span class="name">{appt.get('client_name','')}</span>, voici le détail de votre service. Merci de nous faire confiance! ✨
</div>

<div class="card">
  <div class="card-title">👤 Informations client</div>
  <div class="client-grid">
    <span class="lbl">Nom</span><span class="val">{appt.get('client_name','')}</span>
    <span class="lbl">Courriel</span><span class="val">{appt.get('client_email','') or '—'}</span>
    <span class="lbl">Téléphone</span><span class="val">{appt.get('client_phone','') or '—'}</span>
    <span class="lbl">Adresse</span><span class="val">{appt.get('client_address','') or '—'}</span>
  </div>
</div>

<table class="service-table">
  <thead><tr><th>Description du service</th><th>Date</th><th>Prix</th></tr></thead>
  <tbody>
    <tr>
      <td><strong>{appt.get('title','Service')}</strong></td>
      <td>{appt.get('date','')}</td>
      <td>{price:.2f} $</td>
    </tr>
    <tr class="total-row">
      <td colspan="2" style="text-align:right;">TOTAL À PAYER</td>
      <td>{price:.2f} $</td>
    </tr>
  </tbody>
</table>

{"<div class='notes-card card'><div class='card-title'>📝 Notes</div><p>" + appt.get('notes','') + "</p></div>" if appt.get('notes') else ""}

{promo_banner_html}

<div class="thankyou">
  <h3>Merci pour votre confiance! 💙</h3>
  <p>Nous espérons vous revoir bientôt. N'hésitez pas à nous contacter pour toute question.</p>
</div>

<div class="footer">
  <strong>Lavage de Vitres Bois-Franc</strong> · 514-570-9802 · Lavagedevitre.org<br>
  Service de lavage de vitres résidentiel et commercial
</div>
</div>

<script>window.onload=function(){{window.print();}}</script>
</body></html>"""
    return HTMLResponse(content=html)

# --- Monthly Report ---

@api_router.get("/report/monthly")
async def monthly_report(month: Optional[str] = None):
    """Generate monthly report"""
    from fastapi.responses import HTMLResponse
    now = datetime.now(timezone.utc)
    if not month:
        month = now.strftime("%Y-%m")
    month_start = f"{month}-01"
    month_end = f"{month}-31"

    appts = await db.appointments.find({"date": {"$gte": month_start, "$lte": month_end}}, {"_id": 0}).sort("date", 1).to_list(10000)
    reqs = await db.appointment_requests.find({"preferred_date": {"$gte": month_start, "$lte": month_end}}, {"_id": 0}).to_list(10000)

    total_rev = sum(a.get('price', 0) for a in appts)
    completed = len([a for a in appts if a.get('status') == 'completed'])
    upcoming = len([a for a in appts if a.get('status') == 'upcoming'])
    cancelled = len([a for a in appts if a.get('status') == 'cancelled'])
    accepted_reqs = len([r for r in reqs if r.get('status') == 'accepted'])
    pending_reqs = len([r for r in reqs if r.get('status') == 'pending'])

    # Top clients
    client_stats = {}
    for a in appts:
        name = a.get('client_name', '')
        if name not in client_stats:
            client_stats[name] = {'count': 0, 'revenue': 0}
        client_stats[name]['count'] += 1
        client_stats[name]['revenue'] += a.get('price', 0)
    top = sorted(client_stats.items(), key=lambda x: x[1]['revenue'], reverse=True)[:10]

    appt_rows = ""
    for a in appts:
        appt_rows += f"<tr><td>{a.get('date','')}</td><td>{a.get('time_slot','')}</td><td>{a.get('client_name','')}</td><td>{a.get('title','')}</td><td>{a.get('price',0):.2f}$</td><td>{a.get('status','')}</td></tr>"

    client_rows = ""
    for name, stats in top:
        client_rows += f"<tr><td>{name}</td><td>{stats['count']}</td><td>{stats['revenue']:.2f}$</td></tr>"

    display_month = datetime.strptime(month + "-01", "%Y-%m-%d").strftime("%B %Y")

    html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Rapport {display_month}</title>
<style>
body{{font-family:-apple-system,sans-serif;max-width:800px;margin:30px auto;padding:20px;color:#0A0A0A;font-size:13px;}}
h1{{font-size:24px;font-weight:800;}}.brand{{color:#0891B2;font-size:14px;margin-bottom:24px;}}
h2{{font-size:16px;margin-top:24px;border-bottom:2px solid #0891B2;padding-bottom:6px;}}
.stats{{display:flex;gap:12px;margin:16px 0;}}
.stat{{flex:1;background:#F5F5F5;border-radius:8px;padding:14px;text-align:center;}}
.stat-val{{font-size:22px;font-weight:800;color:#0891B2;}}.stat-label{{font-size:11px;color:#737373;text-transform:uppercase;margin-top:4px;}}
table{{width:100%;border-collapse:collapse;margin-top:10px;}}
th{{background:#0891B2;color:white;padding:8px;text-align:left;font-size:11px;text-transform:uppercase;}}
td{{padding:7px 8px;border-bottom:1px solid #E5E5E5;}}
@media print{{body{{margin:0;}}}}
</style></head><body>
<h1>Rapport mensuel</h1>
<div class="brand">{display_month} — BrightCalendar</div>
<div class="stats">
<div class="stat"><div class="stat-val">{total_rev:.2f}$</div><div class="stat-label">Revenu</div></div>
<div class="stat"><div class="stat-val">{len(appts)}</div><div class="stat-label">RDV total</div></div>
<div class="stat"><div class="stat-val">{completed}</div><div class="stat-label">Complétés</div></div>
<div class="stat"><div class="stat-val">{cancelled}</div><div class="stat-label">Annulés</div></div>
<div class="stat"><div class="stat-val">{len(reqs)}</div><div class="stat-label">Demandes</div></div>
</div>
<h2>Meilleurs clients</h2>
<table><tr><th>Client</th><th>RDV</th><th>Revenu</th></tr>{client_rows}</table>
<h2>Tous les rendez-vous ({len(appts)})</h2>
<table><tr><th>Date</th><th>Heure</th><th>Client</th><th>Service</th><th>Prix</th><th>Statut</th></tr>{appt_rows}</table>
<script>window.onload=function(){{window.print();}}</script>
</body></html>"""
    return HTMLResponse(content=html)

# --- Client Reviews ---

class ReviewCreate(BaseModel):
    appointment_id: str
    client_name: str
    rating: int  # 1-5
    comment: Optional[str] = ""

class ReviewResponse(BaseModel):
    id: str
    appointment_id: str
    client_name: str
    rating: int
    comment: str
    created_at: str

@api_router.post("/reviews", response_model=ReviewResponse)
async def create_review(data: ReviewCreate):
    review = {
        "id": str(uuid.uuid4()),
        "appointment_id": data.appointment_id,
        "client_name": data.client_name,
        "rating": data.rating,
        "comment": data.comment or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.reviews.insert_one(review)
    return ReviewResponse(**{k: v for k, v in review.items() if k != "_id"})

@api_router.get("/reviews", response_model=List[ReviewResponse])
async def get_reviews():
    reviews = await db.reviews.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [ReviewResponse(**r) for r in reviews]

@api_router.post("/reviews/send-request/{appointment_id}")
async def send_review_request(appointment_id: str):
    """Send review request email to client after service"""
    appt = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    client_email = appt.get("client_email", "")
    if not client_email:
        raise HTTPException(status_code=400, detail="Client n'a pas de courriel")

    app_url = os.environ.get("APP_URL", "").rstrip("/")
    review_url = f"{app_url}/api/review-page/{appointment_id}"
    html = f"""<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px;">
    <h2 style="color:#0891B2;">Comment était votre expérience?</h2>
    <p>Bonjour {appt.get('client_name','')},</p>
    <p>Merci d'avoir fait appel à nos services! Nous aimerions avoir votre avis.</p>
    <a href="{review_url}" style="display:inline-block;background:#0891B2;color:white;padding:12px 24px;border-radius:4px;text-decoration:none;font-weight:600;margin:16px 0;">Laisser un avis</a>
    <p style="color:#A3A3A3;font-size:13px;">— BrightCalendar</p>
    </div>"""

    if resend.api_key:
        try:
            await asyncio.to_thread(resend.Emails.send, {
                "from": "onboarding@resend.dev",
                "to": [client_email],
                "subject": "Comment était votre expérience? — BrightCalendar",
                "html": html,
            })
            return {"message": f"Demande d'avis envoyée à {client_email}"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    raise HTTPException(status_code=400, detail="Email non configuré")

@api_router.get("/review-page/{appointment_id}")
async def review_page(appointment_id: str):
    """Public page for client to leave a review"""
    from fastapi.responses import HTMLResponse
    appt = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    name = appt.get('client_name', 'Client') if appt else 'Client'

    html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Votre avis</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box;}}body{{font-family:-apple-system,sans-serif;background:#FAFAFA;display:flex;justify-content:center;padding:40px 20px;}}
.c{{max-width:480px;width:100%;}}h1{{font-size:24px;font-weight:800;margin-bottom:8px;}}
.sub{{color:#737373;margin-bottom:24px;}}.stars{{display:flex;gap:8px;margin:16px 0;}}
.star{{font-size:36px;cursor:pointer;color:#E5E5E5;transition:color 0.2s;}}.star.active{{color:#F59E0B;}}
textarea{{width:100%;border:none;border-bottom:1px solid #E5E5E5;padding:12px 0;font-size:16px;font-family:inherit;resize:none;min-height:80px;outline:none;}}
.btn{{width:100%;padding:16px;background:#0891B2;color:white;border:none;border-radius:4px;font-size:16px;font-weight:600;cursor:pointer;margin-top:16px;}}
.success{{display:none;text-align:center;padding:40px;}}.success h2{{font-size:22px;margin-bottom:8px;}}.success p{{color:#737373;}}
</style></head><body><div class="c">
<div id="form"><h1>Votre avis compte!</h1><p class="sub">Merci {name}, comment était votre expérience?</p>
<div class="stars" id="stars"></div>
<textarea id="comment" placeholder="Commentaire (optionnel)..."></textarea>
<button class="btn" onclick="submit()">Envoyer mon avis</button></div>
<div class="success" id="success"><h2>Merci!</h2><p>Votre avis a été enregistré.</p></div>
<script>
let rating=0;const stars=document.getElementById('stars');
for(let i=1;i<=5;i++){{const s=document.createElement('span');s.className='star';s.textContent='★';s.onclick=()=>{{rating=i;document.querySelectorAll('.star').forEach((el,idx)=>el.className=idx<i?'star active':'star');}};stars.appendChild(s);}}
async function submit(){{if(!rating){{alert('Choisissez une note');return;}}
const res=await fetch('/api/reviews',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{appointment_id:'{appointment_id}',client_name:'{name}',rating,comment:document.getElementById('comment').value}})}});
if(res.ok){{document.getElementById('form').style.display='none';document.getElementById('success').style.display='block';}}}}
</script></div></body></html>"""
    return HTMLResponse(content=html)


# --- Backup & Export ---

@api_router.get("/backup/export")
async def export_backup():
    """Export all data as readable HTML page"""
    from fastapi.responses import HTMLResponse
    appointments = await db.appointments.find({}, {"_id": 0}).sort("date", -1).to_list(10000)
    requests = await db.appointment_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)

    appt_rows = ""
    for a in appointments:
        appt_rows += f"""<tr>
            <td>{a.get('date','')}</td><td>{a.get('time_slot','')}</td>
            <td>{a.get('client_name','')}</td><td>{a.get('client_phone','')}</td>
            <td>{a.get('client_email','')}</td><td>{a.get('client_address','')}</td>
            <td>{a.get('duration_minutes','')}m</td><td>{a.get('price',0):.2f} $</td>
            <td>{a.get('status','')}</td><td>{a.get('notes','')}</td>
        </tr>"""

    req_rows = ""
    for r in requests:
        req_rows += f"""<tr>
            <td>{r.get('preferred_date','')}</td><td>{r.get('preferred_time','')}</td>
            <td>{r.get('customer_name','')}</td><td>{r.get('customer_phone','')}</td>
            <td>{r.get('customer_email','')}</td><td>{r.get('customer_address','')}</td>
            <td>{r.get('status','')}</td><td>{r.get('message','')}</td>
        </tr>"""

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")

    html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Backup BrightCalendar - {now}</title>
<style>
body{{font-family:-apple-system,sans-serif;max-width:1200px;margin:20px auto;padding:20px;color:#0A0A0A;font-size:13px;}}
h1{{font-size:24px;margin-bottom:2px;}}
.brand{{color:#0891B2;margin-bottom:20px;}}
h2{{font-size:18px;margin-top:30px;border-bottom:2px solid #0891B2;padding-bottom:6px;}}
table{{width:100%;border-collapse:collapse;margin-top:10px;}}
th{{background:#0891B2;color:white;padding:8px 6px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.3px;}}
td{{padding:7px 6px;border-bottom:1px solid #E5E5E5;}}
tr:hover{{background:#F5F5F5;}}
.count{{color:#737373;font-size:14px;}}
@media print{{body{{margin:0;font-size:11px;}} th{{background:#333;}} }}
</style></head><body>
<h1>Backup BrightCalendar</h1>
<div class="brand">{now}</div>

<h2>Rendez-vous <span class="count">({len(appointments)})</span></h2>
<table>
<tr><th>Date</th><th>Heure</th><th>Client</th><th>Tél.</th><th>Courriel</th><th>Adresse</th><th>Durée</th><th>Prix</th><th>Statut</th><th>Notes</th></tr>
{appt_rows}
</table>

<h2>Demandes <span class="count">({len(requests)})</span></h2>
<table>
<tr><th>Date</th><th>Heure</th><th>Client</th><th>Tél.</th><th>Courriel</th><th>Adresse</th><th>Statut</th><th>Message</th></tr>
{req_rows}
</table>

<script>window.onload=function(){{window.print();}}</script>
</body></html>"""
    return HTMLResponse(content=html)

@api_router.get("/backup/clients-csv")
async def export_clients_csv():
    """Export all client data as CSV text"""
    from fastapi.responses import PlainTextResponse
    pipeline = [
        {"$group": {
            "_id": "$client_name",
            "count": {"$sum": 1},
            "total_spent": {"$sum": "$price"},
            "last_visit": {"$max": "$date"},
            "email": {"$first": "$client_email"},
            "phone": {"$first": "$client_phone"},
            "address": {"$first": "$client_address"},
        }},
        {"$sort": {"last_visit": -1}},
    ]
    clients = await db.appointments.aggregate(pipeline).to_list(500)

    lines = ["Nom,Courriel,Téléphone,Adresse,Nombre RDV,Total dépensé,Dernière visite"]
    for c in clients:
        if not c["_id"]:
            continue
        name = (c["_id"] or "").replace(",", " ")
        email = (c.get("email") or "").replace(",", " ")
        phone = (c.get("phone") or "").replace(",", " ")
        address = (c.get("address") or "").replace(",", " ")
        lines.append(f'{name},{email},{phone},{address},{c["count"]},{c.get("total_spent", 0):.2f},{c.get("last_visit", "")}')

    csv_text = "\n".join(lines)
    return PlainTextResponse(content=csv_text, media_type="text/csv", headers={"Content-Disposition": "attachment; filename=clients_brightcalendar.csv"})

@api_router.get("/print/appointment/{appointment_id}")
async def print_appointment(appointment_id: str):
    """Generate printable HTML for an appointment"""
    from fastapi.responses import HTMLResponse
    appt = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>RDV - {appt.get('client_name','')}</title>
<style>
body{{font-family:-apple-system,sans-serif;max-width:600px;margin:40px auto;padding:20px;color:#0A0A0A;}}
h1{{font-size:24px;margin-bottom:4px;}}
.brand{{color:#0891B2;font-size:14px;margin-bottom:24px;}}
table{{width:100%;border-collapse:collapse;margin-top:16px;}}
td{{padding:10px 0;vertical-align:top;}}
.label{{font-size:12px;font-weight:600;color:#737373;text-transform:uppercase;letter-spacing:0.5px;width:120px;}}
.value{{font-size:15px;}}
.divider{{border-top:1px solid #E5E5E5;margin:16px 0;}}
.price{{font-size:20px;font-weight:800;color:#0891B2;}}
@media print{{body{{margin:0;}}}}
</style></head><body>
<h1>{appt.get('title','Rendez-vous')}</h1>
<div class="brand">BrightCalendar</div>
<div class="divider"></div>
<table>
<tr><td class="label">Client</td><td class="value">{appt.get('client_name','')}</td></tr>
<tr><td class="label">Courriel</td><td class="value">{appt.get('client_email','')}</td></tr>
<tr><td class="label">Téléphone</td><td class="value">{appt.get('client_phone','')}</td></tr>
<tr><td class="label">Adresse</td><td class="value">{appt.get('client_address','')}</td></tr>
</table>
<div class="divider"></div>
<table>
<tr><td class="label">Date</td><td class="value">{appt.get('date','')}</td></tr>
<tr><td class="label">Heure</td><td class="value">{appt.get('time_slot','')}</td></tr>
<tr><td class="label">Durée</td><td class="value">{appt.get('duration_minutes','')} minutes</td></tr>
</table>
<div class="divider"></div>
<table>
<tr><td class="label">Prix</td><td class="price">{appt.get('price',0):.2f} $</td></tr>
</table>
{"<div class='divider'></div><table><tr><td class='label'>Notes</td><td class='value'>" + appt.get('notes','') + "</td></tr></table>" if appt.get('notes') else ""}
<div class="divider"></div>
<p style="font-size:12px;color:#A3A3A3;margin-top:24px;">Imprimé depuis BrightCalendar</p>
<script>window.onload=function(){{window.print();}}</script>
</body></html>"""
    return HTMLResponse(content=html)


# --- Backup by Email ---

@api_router.post("/backup/email")
async def backup_by_email():
    """Send full backup to owner's email"""
    appointments = await db.appointments.find({}, {"_id": 0}).sort("date", -1).to_list(10000)
    requests_data = await db.appointment_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")

    # Build HTML email
    appt_rows = ""
    for a in appointments:
        appt_rows += f"<tr><td>{a.get('date','')}</td><td>{a.get('time_slot','')}</td><td>{a.get('client_name','')}</td><td>{a.get('client_phone','')}</td><td>{a.get('client_email','')}</td><td>{a.get('client_address','')}</td><td>{a.get('price',0):.2f}$</td><td>{a.get('status','')}</td></tr>"

    req_rows = ""
    for r in requests_data:
        req_rows += f"<tr><td>{r.get('preferred_date','')}</td><td>{r.get('preferred_time','')}</td><td>{r.get('customer_name','')}</td><td>{r.get('customer_phone','')}</td><td>{r.get('customer_email','')}</td><td>{r.get('status','')}</td></tr>"

    html = f"""<div style="font-family:sans-serif;max-width:800px;margin:0 auto;font-size:13px;">
    <h1 style="color:#0891B2;">Backup BrightCalendar</h1>
    <p>{now} — {len(appointments)} rdv, {len(requests_data)} demandes</p>
    <h2>Rendez-vous ({len(appointments)})</h2>
    <table style="width:100%;border-collapse:collapse;"><tr style="background:#0891B2;color:white;"><th style="padding:6px;">Date</th><th style="padding:6px;">Heure</th><th style="padding:6px;">Client</th><th style="padding:6px;">Tél</th><th style="padding:6px;">Email</th><th style="padding:6px;">Adresse</th><th style="padding:6px;">Prix</th><th style="padding:6px;">Statut</th></tr>{appt_rows}</table>
    <h2>Demandes ({len(requests_data)})</h2>
    <table style="width:100%;border-collapse:collapse;"><tr style="background:#0891B2;color:white;"><th style="padding:6px;">Date</th><th style="padding:6px;">Heure</th><th style="padding:6px;">Client</th><th style="padding:6px;">Tél</th><th style="padding:6px;">Email</th><th style="padding:6px;">Statut</th></tr>{req_rows}</table>
    </div>"""

    if NOTIFY_EMAIL and resend.api_key:
        try:
            await asyncio.to_thread(resend.Emails.send, {
                "from": "onboarding@resend.dev",
                "to": [NOTIFY_EMAIL],
                "subject": f"Backup BrightCalendar — {now}",
                "html": html,
            })
            return {"message": f"Backup envoyé à {NOTIFY_EMAIL}"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Erreur envoi: {str(e)}")
    else:
        raise HTTPException(status_code=400, detail="Email non configuré")

# --- Price Estimation ---

class PriceEstimate(BaseModel):
    num_windows: int = 0
    window_type: str = "standard"  # standard, large, skylight

@api_router.post("/estimate")
async def estimate_price(data: PriceEstimate):
    """Calculate price estimate based on number of windows"""
    rates = {
        "standard": 15.0,
        "standard_coulissante": 20.0,
        "standard_double_coulissante": 40.0,
        "large": 20.0,
        "skylight": 30.0,
        "patio_simple": 40.0,
        "patio_double": 60.0,
    }
    rate = rates.get(data.window_type, 8.0)
    total = data.num_windows * rate
    return {
        "num_windows": data.num_windows,
        "window_type": data.window_type,
        "rate_per_window": rate,
        "estimated_total": round(total, 2),
    }

# --- Share Appointment ---

@api_router.get("/share/appointment/{appointment_id}")
async def share_appointment(appointment_id: str):
    """Generate shareable text for an appointment"""
    appt = await db.appointments.find_one({"id": appointment_id}, {"_id": 0})
    if not appt:
        raise HTTPException(status_code=404, detail="Appointment not found")

    text = f"""Rendez-vous confirmé — BrightCalendar

Client: {appt.get('client_name','')}
Date: {appt.get('date','')}
Heure: {appt.get('time_slot','')}
Durée: {appt.get('duration_minutes','')} min
Adresse: {appt.get('client_address','')}
"""
    if appt.get('price', 0) > 0:
        text += f"Prix: {appt['price']:.2f} $\n"

    return {"text": text.strip()}

# --- Recurrence ---

class RecurrenceCreate(BaseModel):
    appointment_id: str
    interval_months: int = 3  # every X months
    occurrences: int = 4  # how many times

@api_router.post("/appointments/recurrence")
async def create_recurring(data: RecurrenceCreate):
    """Create recurring appointments from an existing appointment"""
    original = await db.appointments.find_one({"id": data.appointment_id}, {"_id": 0})
    if not original:
        raise HTTPException(status_code=404, detail="Appointment not found")

    created = []
    base_date = datetime.strptime(original["date"], "%Y-%m-%d")

    for i in range(1, data.occurrences + 1):
        new_date = base_date
        # Add months
        month = base_date.month + (data.interval_months * i)
        year = base_date.year + (month - 1) // 12
        month = ((month - 1) % 12) + 1
        day = min(base_date.day, 28)  # safe day
        new_date = datetime(year, month, day)

        new_appt = {
            "id": str(uuid.uuid4()),
            "title": original["title"],
            "client_name": original["client_name"],
            "client_email": original.get("client_email", ""),
            "client_phone": original.get("client_phone", ""),
            "client_address": original.get("client_address", ""),
            "date": new_date.strftime("%Y-%m-%d"),
            "time_slot": original["time_slot"],
            "duration_minutes": original["duration_minutes"],
            "price": original.get("price", 0),
            "notes": f"Récurrence #{i} — {original.get('notes', '')}",
            "status": "upcoming",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.appointments.insert_one(new_appt)
        created.append({"id": new_appt["id"], "date": new_appt["date"]})

    return {"message": f"{len(created)} rendez-vous créés", "appointments": created}



async def seed_requests():
    """Seed sample requests for testing"""
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")

    samples = [
        {
            "id": str(uuid.uuid4()),
            "customer_name": "Emma Johnson",
            "customer_email": "emma@example.com",
            "customer_phone": "514-555-1234",
            "customer_address": "123 Rue Principale, Bois-Franc",
            "preferred_date": today,
            "preferred_time": "10:00",
            "message": "I'd like to discuss a new marketing strategy for Q3.",
            "status": "pending",
            "suggested_date": None,
            "suggested_time": None,
            "suggested_note": None,
            "created_at": now.isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "customer_name": "Frank Miller",
            "customer_email": "frank@company.org",
            "customer_phone": "514-555-5678",
            "customer_address": "456 Boulevard des Sources",
            "preferred_date": today,
            "preferred_time": "13:00",
            "message": "Need help with tax planning for the new fiscal year.",
            "status": "pending",
            "suggested_date": None,
            "suggested_time": None,
            "suggested_note": None,
            "created_at": now.isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "customer_name": "Grace Lee",
            "customer_email": "grace.lee@startup.io",
            "customer_phone": "438-555-9012",
            "customer_address": "789 Avenue Sainte-Croix",
            "preferred_date": today,
            "preferred_time": "15:30",
            "message": "Looking for consulting on our product launch timeline.",
            "status": "pending",
            "suggested_date": None,
            "suggested_time": None,
            "suggested_note": None,
            "created_at": now.isoformat(),
        },
    ]

    await db.appointment_requests.delete_many({})
    await db.appointment_requests.insert_many(samples)
    return {"message": f"Seeded {len(samples)} requests for {today}"}

@api_router.post("/appointments/seed")
async def seed_appointments():
    """Seed sample appointments for testing"""
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    
    samples = [
        {
            "id": str(uuid.uuid4()),
            "title": "Strategy Review",
            "client_name": "Alice Martin",
            "client_email": "alice@example.com",
            "client_phone": "514-555-0001",
            "client_address": "100 Rue Principale, Bois-Franc",
            "date": today,
            "time_slot": "09:00",
            "duration_minutes": 60,
            "notes": "Quarterly strategy review meeting",
            "status": "upcoming",
            "created_at": now.isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "title": "Project Kickoff",
            "client_name": "Bob Chen",
            "client_email": "bob@company.com",
            "client_phone": "514-555-0002",
            "client_address": "200 Boulevard des Sources",
            "date": today,
            "time_slot": "11:00",
            "duration_minutes": 45,
            "notes": "New website redesign project",
            "status": "upcoming",
            "created_at": now.isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "title": "Budget Planning",
            "client_name": "Carol Davis",
            "client_email": "carol@firm.ca",
            "client_phone": "438-555-0003",
            "client_address": "300 Avenue Sainte-Croix",
            "date": today,
            "time_slot": "14:00",
            "duration_minutes": 30,
            "notes": "Annual budget discussion",
            "status": "upcoming",
            "created_at": now.isoformat(),
        },
    ]
    
    await db.appointments.delete_many({})
    await db.appointments.insert_many(samples)
    return {"message": f"Seeded {len(samples)} appointments for {today}"}

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    try:
        scheduler.shutdown(wait=False)
    except Exception:
        pass
    client.close()


# Scheduler: auto backup every day at midnight (00:00)
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

scheduler = AsyncIOScheduler(timezone="America/Toronto")


@app.on_event("startup")
async def start_scheduler():
    try:
        scheduler.add_job(_create_auto_backup, CronTrigger(hour=0, minute=0), id="daily_backup", replace_existing=True)
        scheduler.start()
        logger.info("Scheduler started: daily backup @ 00:00")
    except Exception as e:
        logger.error(f"Scheduler failed to start: {e}")
