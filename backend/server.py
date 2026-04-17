from fastapi import FastAPI, APIRouter, HTTPException
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

# --- Request Models ---

class RequestCreate(BaseModel):
    customer_name: str
    customer_email: str
    customer_phone: Optional[str] = ""
    customer_address: Optional[str] = ""
    preferred_date: str  # YYYY-MM-DD
    preferred_time: str  # HH:MM
    message: Optional[str] = ""

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

# --- Booking Page (for customers) ---

@api_router.get("/booking", response_class=HTMLResponse)
async def booking_page():
    """Public booking page for customers to request appointments"""
    html_path = ROOT_DIR / "booking.html"
    return HTMLResponse(content=html_path.read_text())

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
        "standard": 8.0,
        "large": 15.0,
        "skylight": 25.0,
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
    client.close()
