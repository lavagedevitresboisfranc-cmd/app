from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# --- Models ---

class AppointmentCreate(BaseModel):
    title: str
    client_name: str
    date: str  # YYYY-MM-DD
    time_slot: str  # HH:MM
    duration_minutes: int = 30
    notes: Optional[str] = ""
    status: str = "upcoming"  # upcoming, completed, cancelled

class AppointmentUpdate(BaseModel):
    title: Optional[str] = None
    client_name: Optional[str] = None
    date: Optional[str] = None
    time_slot: Optional[str] = None
    duration_minutes: Optional[int] = None
    notes: Optional[str] = None
    status: Optional[str] = None

class AppointmentResponse(BaseModel):
    id: str
    title: str
    client_name: str
    date: str
    time_slot: str
    duration_minutes: int
    notes: str
    status: str
    created_at: str

# --- Request Models ---

class RequestCreate(BaseModel):
    customer_name: str
    customer_email: str
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
    preferred_date: str
    preferred_time: str
    message: str
    status: str  # pending, accepted, alternative_offered, declined
    suggested_date: Optional[str] = None
    suggested_time: Optional[str] = None
    suggested_note: Optional[str] = None
    created_at: str

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
        "date": data.date,
        "time_slot": data.time_slot,
        "duration_minutes": data.duration_minutes,
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

@api_router.put("/requests/{request_id}/accept", response_model=AppointmentResponse)
async def accept_request(request_id: str):
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
        "date": req["preferred_date"],
        "time_slot": req["preferred_time"],
        "duration_minutes": 30,
        "notes": req["message"],
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

@api_router.post("/requests/seed")
async def seed_requests():
    """Seed sample requests for testing"""
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")

    samples = [
        {
            "id": str(uuid.uuid4()),
            "customer_name": "Emma Johnson",
            "customer_email": "emma@example.com",
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
            "date": today,
            "time_slot": "14:00",
            "duration_minutes": 30,
            "notes": "Annual budget discussion",
            "status": "upcoming",
            "created_at": now.isoformat(),
        },
        {
            "id": str(uuid.uuid4()),
            "title": "Team Sync",
            "client_name": "David Wilson",
            "date": today,
            "time_slot": "16:00",
            "duration_minutes": 30,
            "notes": "",
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
