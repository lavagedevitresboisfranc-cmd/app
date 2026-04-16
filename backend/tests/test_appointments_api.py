"""
Backend API tests for Appointment Management App
Tests: CRUD operations, filtering, seed endpoint
"""
import pytest
import requests
import os
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

# Load frontend .env to get the public URL
frontend_env = Path(__file__).parent.parent.parent / 'frontend' / '.env'
load_dotenv(frontend_env)

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    raise ValueError("EXPO_PUBLIC_BACKEND_URL not found in environment")

class TestHealthCheck:
    """Basic health check"""
    
    def test_api_root(self):
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"✓ API root accessible: {data}")

class TestSeedEndpoint:
    """Test seed endpoint for sample data"""
    
    def test_seed_appointments(self):
        response = requests.post(f"{BASE_URL}/api/appointments/seed")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "Seeded" in data["message"]
        print(f"✓ Seed endpoint working: {data['message']}")

class TestAppointmentsCRUD:
    """Test CRUD operations for appointments"""
    
    def test_get_all_appointments(self):
        """GET /api/appointments - should return list"""
        response = requests.get(f"{BASE_URL}/api/appointments")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET all appointments: {len(data)} appointments found")
    
    def test_create_appointment_and_verify(self):
        """POST /api/appointments - create and verify persistence"""
        payload = {
            "title": "TEST_Pytest Meeting",
            "client_name": "TEST_John Doe",
            "date": "2026-05-01",
            "time_slot": "10:00",
            "duration_minutes": 45,
            "notes": "Test appointment from pytest",
            "status": "upcoming"
        }
        
        # Create appointment
        create_response = requests.post(
            f"{BASE_URL}/api/appointments",
            json=payload
        )
        assert create_response.status_code == 200
        created = create_response.json()
        
        # Verify response structure
        assert "id" in created
        assert created["title"] == payload["title"]
        assert created["client_name"] == payload["client_name"]
        assert created["date"] == payload["date"]
        assert created["time_slot"] == payload["time_slot"]
        assert created["duration_minutes"] == payload["duration_minutes"]
        assert created["status"] == payload["status"]
        
        appointment_id = created["id"]
        print(f"✓ Created appointment: {appointment_id}")
        
        # Verify persistence with GET
        get_response = requests.get(f"{BASE_URL}/api/appointments/{appointment_id}")
        assert get_response.status_code == 200
        fetched = get_response.json()
        assert fetched["id"] == appointment_id
        assert fetched["title"] == payload["title"]
        print(f"✓ Verified persistence: appointment exists in database")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/appointments/{appointment_id}")
    
    def test_get_single_appointment(self):
        """GET /api/appointments/{id} - fetch single appointment"""
        # First create one
        payload = {
            "title": "TEST_Single Fetch",
            "client_name": "TEST_Jane Smith",
            "date": "2026-05-02",
            "time_slot": "14:00",
            "duration_minutes": 30,
            "status": "upcoming"
        }
        create_response = requests.post(f"{BASE_URL}/api/appointments", json=payload)
        appointment_id = create_response.json()["id"]
        
        # Fetch it
        response = requests.get(f"{BASE_URL}/api/appointments/{appointment_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == appointment_id
        assert data["title"] == payload["title"]
        print(f"✓ GET single appointment: {data['title']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/appointments/{appointment_id}")
    
    def test_get_nonexistent_appointment(self):
        """GET /api/appointments/{id} - should return 404 for invalid ID"""
        response = requests.get(f"{BASE_URL}/api/appointments/nonexistent-id-12345")
        assert response.status_code == 404
        print("✓ GET nonexistent appointment returns 404")
    
    def test_update_appointment_and_verify(self):
        """PUT /api/appointments/{id} - update and verify changes"""
        # Create appointment
        payload = {
            "title": "TEST_Original Title",
            "client_name": "TEST_Client",
            "date": "2026-05-03",
            "time_slot": "11:00",
            "duration_minutes": 60,
            "status": "upcoming"
        }
        create_response = requests.post(f"{BASE_URL}/api/appointments", json=payload)
        appointment_id = create_response.json()["id"]
        
        # Update it
        update_payload = {
            "title": "TEST_Updated Title",
            "status": "completed"
        }
        update_response = requests.put(
            f"{BASE_URL}/api/appointments/{appointment_id}",
            json=update_payload
        )
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["title"] == "TEST_Updated Title"
        assert updated["status"] == "completed"
        print(f"✓ Updated appointment: {updated['title']}, status: {updated['status']}")
        
        # Verify persistence
        get_response = requests.get(f"{BASE_URL}/api/appointments/{appointment_id}")
        fetched = get_response.json()
        assert fetched["title"] == "TEST_Updated Title"
        assert fetched["status"] == "completed"
        print("✓ Verified update persistence")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/appointments/{appointment_id}")
    
    def test_update_nonexistent_appointment(self):
        """PUT /api/appointments/{id} - should return 404 for invalid ID"""
        response = requests.put(
            f"{BASE_URL}/api/appointments/nonexistent-id-12345",
            json={"title": "Test"}
        )
        assert response.status_code == 404
        print("✓ UPDATE nonexistent appointment returns 404")
    
    def test_delete_appointment_and_verify(self):
        """DELETE /api/appointments/{id} - delete and verify removal"""
        # Create appointment
        payload = {
            "title": "TEST_To Delete",
            "client_name": "TEST_Delete Client",
            "date": "2026-05-04",
            "time_slot": "15:00",
            "duration_minutes": 30,
            "status": "upcoming"
        }
        create_response = requests.post(f"{BASE_URL}/api/appointments", json=payload)
        appointment_id = create_response.json()["id"]
        
        # Delete it
        delete_response = requests.delete(f"{BASE_URL}/api/appointments/{appointment_id}")
        assert delete_response.status_code == 200
        data = delete_response.json()
        assert "message" in data
        print(f"✓ Deleted appointment: {appointment_id}")
        
        # Verify deletion
        get_response = requests.get(f"{BASE_URL}/api/appointments/{appointment_id}")
        assert get_response.status_code == 404
        print("✓ Verified deletion: appointment no longer exists")
    
    def test_delete_nonexistent_appointment(self):
        """DELETE /api/appointments/{id} - should return 404 for invalid ID"""
        response = requests.delete(f"{BASE_URL}/api/appointments/nonexistent-id-12345")
        assert response.status_code == 404
        print("✓ DELETE nonexistent appointment returns 404")

class TestAppointmentFiltering:
    """Test filtering endpoints"""
    
    def test_filter_by_date(self):
        """GET /api/appointments?date=YYYY-MM-DD - filter by date"""
        # Seed data first
        requests.post(f"{BASE_URL}/api/appointments/seed")
        
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(f"{BASE_URL}/api/appointments?date={today}")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Verify all returned appointments match the date
        for appointment in data:
            assert appointment["date"] == today
        
        print(f"✓ Filter by date ({today}): {len(data)} appointments")
    
    def test_filter_by_status_upcoming(self):
        """GET /api/appointments?status=upcoming - filter by status"""
        response = requests.get(f"{BASE_URL}/api/appointments?status=upcoming")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Verify all returned appointments have status=upcoming
        for appointment in data:
            assert appointment["status"] == "upcoming"
        
        print(f"✓ Filter by status (upcoming): {len(data)} appointments")
    
    def test_filter_by_status_completed(self):
        """GET /api/appointments?status=completed - filter by status"""
        # Create a completed appointment
        payload = {
            "title": "TEST_Completed Meeting",
            "client_name": "TEST_Client",
            "date": "2026-05-05",
            "time_slot": "09:00",
            "duration_minutes": 30,
            "status": "completed"
        }
        create_response = requests.post(f"{BASE_URL}/api/appointments", json=payload)
        appointment_id = create_response.json()["id"]
        
        response = requests.get(f"{BASE_URL}/api/appointments?status=completed")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Verify all returned appointments have status=completed
        for appointment in data:
            assert appointment["status"] == "completed"
        
        print(f"✓ Filter by status (completed): {len(data)} appointments")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/appointments/{appointment_id}")
    
    def test_filter_by_status_cancelled(self):
        """GET /api/appointments?status=cancelled - filter by status"""
        # Create a cancelled appointment
        payload = {
            "title": "TEST_Cancelled Meeting",
            "client_name": "TEST_Client",
            "date": "2026-05-06",
            "time_slot": "10:00",
            "duration_minutes": 30,
            "status": "cancelled"
        }
        create_response = requests.post(f"{BASE_URL}/api/appointments", json=payload)
        appointment_id = create_response.json()["id"]
        
        response = requests.get(f"{BASE_URL}/api/appointments?status=cancelled")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Verify all returned appointments have status=cancelled
        for appointment in data:
            assert appointment["status"] == "cancelled"
        
        print(f"✓ Filter by status (cancelled): {len(data)} appointments")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/appointments/{appointment_id}")

class TestDataValidation:
    """Test data validation and edge cases"""
    
    def test_create_appointment_missing_required_fields(self):
        """POST /api/appointments - should validate required fields"""
        # Missing title
        payload = {
            "client_name": "TEST_Client",
            "date": "2026-05-07",
            "time_slot": "10:00"
        }
        response = requests.post(f"{BASE_URL}/api/appointments", json=payload)
        assert response.status_code == 422  # Validation error
        print("✓ Validation: missing required fields returns 422")
    
    def test_update_with_empty_payload(self):
        """PUT /api/appointments/{id} - should reject empty update"""
        # Create appointment first
        payload = {
            "title": "TEST_Temp",
            "client_name": "TEST_Client",
            "date": "2026-05-08",
            "time_slot": "10:00",
            "duration_minutes": 30,
            "status": "upcoming"
        }
        create_response = requests.post(f"{BASE_URL}/api/appointments", json=payload)
        appointment_id = create_response.json()["id"]
        
        # Try empty update
        response = requests.put(
            f"{BASE_URL}/api/appointments/{appointment_id}",
            json={}
        )
        assert response.status_code == 400
        print("✓ Validation: empty update payload returns 400")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/appointments/{appointment_id}")
