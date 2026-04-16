"""
Backend API tests for Appointment Request Feature
Tests: Request CRUD, accept/suggest/decline actions, filtering, seed endpoint
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

class TestRequestSeedEndpoint:
    """Test seed endpoint for sample request data"""
    
    def test_seed_requests(self):
        response = requests.post(f"{BASE_URL}/api/requests/seed")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "Seeded" in data["message"]
        print(f"✓ Seed requests endpoint working: {data['message']}")

class TestRequestsCRUD:
    """Test CRUD operations for appointment requests"""
    
    def test_create_request_and_verify(self):
        """POST /api/requests - create request with status=pending"""
        payload = {
            "customer_name": "TEST_Alice Johnson",
            "customer_email": "test_alice@example.com",
            "preferred_date": "2026-05-10",
            "preferred_time": "14:00",
            "message": "I need to discuss project timeline"
        }
        
        # Create request
        create_response = requests.post(
            f"{BASE_URL}/api/requests",
            json=payload
        )
        assert create_response.status_code == 200
        created = create_response.json()
        
        # Verify response structure
        assert "id" in created
        assert created["customer_name"] == payload["customer_name"]
        assert created["customer_email"] == payload["customer_email"]
        assert created["preferred_date"] == payload["preferred_date"]
        assert created["preferred_time"] == payload["preferred_time"]
        assert created["message"] == payload["message"]
        assert created["status"] == "pending"
        assert created["suggested_date"] is None
        assert created["suggested_time"] is None
        assert created["suggested_note"] is None
        assert "created_at" in created
        
        request_id = created["id"]
        print(f"✓ Created request with status=pending: {request_id}")
        
        # Verify persistence with GET
        get_response = requests.get(f"{BASE_URL}/api/requests/{request_id}")
        assert get_response.status_code == 200
        fetched = get_response.json()
        assert fetched["id"] == request_id
        assert fetched["customer_name"] == payload["customer_name"]
        assert fetched["status"] == "pending"
        print(f"✓ Verified persistence: request exists in database")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/requests/{request_id}")
    
    def test_get_all_requests(self):
        """GET /api/requests - should return list of all requests"""
        response = requests.get(f"{BASE_URL}/api/requests")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ GET all requests: {len(data)} requests found")
    
    def test_get_single_request(self):
        """GET /api/requests/{id} - fetch single request"""
        # First create one
        payload = {
            "customer_name": "TEST_Bob Smith",
            "customer_email": "test_bob@example.com",
            "preferred_date": "2026-05-11",
            "preferred_time": "10:00",
            "message": "Need consultation"
        }
        create_response = requests.post(f"{BASE_URL}/api/requests", json=payload)
        request_id = create_response.json()["id"]
        
        # Fetch it
        response = requests.get(f"{BASE_URL}/api/requests/{request_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == request_id
        assert data["customer_name"] == payload["customer_name"]
        assert data["status"] == "pending"
        print(f"✓ GET single request: {data['customer_name']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/requests/{request_id}")
    
    def test_get_nonexistent_request(self):
        """GET /api/requests/{id} - should return 404 for invalid ID"""
        response = requests.get(f"{BASE_URL}/api/requests/nonexistent-id-12345")
        assert response.status_code == 404
        print("✓ GET nonexistent request returns 404")

class TestRequestFiltering:
    """Test filtering requests by status"""
    
    def test_filter_by_status_pending(self):
        """GET /api/requests?status=pending - filter by pending status"""
        # Seed data first
        requests.post(f"{BASE_URL}/api/requests/seed")
        
        response = requests.get(f"{BASE_URL}/api/requests?status=pending")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Verify all returned requests have status=pending
        for request in data:
            assert request["status"] == "pending"
        
        print(f"✓ Filter by status (pending): {len(data)} requests")
    
    def test_filter_by_status_accepted(self):
        """GET /api/requests?status=accepted - filter by accepted status"""
        response = requests.get(f"{BASE_URL}/api/requests?status=accepted")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Verify all returned requests have status=accepted
        for request in data:
            assert request["status"] == "accepted"
        
        print(f"✓ Filter by status (accepted): {len(data)} requests")
    
    def test_filter_by_status_alternative_offered(self):
        """GET /api/requests?status=alternative_offered - filter by alternative_offered status"""
        response = requests.get(f"{BASE_URL}/api/requests?status=alternative_offered")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        
        # Verify all returned requests have status=alternative_offered
        for request in data:
            assert request["status"] == "alternative_offered"
        
        print(f"✓ Filter by status (alternative_offered): {len(data)} requests")

class TestRequestActions:
    """Test accept, suggest, and decline actions"""
    
    def test_accept_request_creates_appointment(self):
        """PUT /api/requests/{id}/accept - should create appointment and mark request as accepted"""
        # Create a request
        payload = {
            "customer_name": "TEST_Carol White",
            "customer_email": "test_carol@example.com",
            "preferred_date": "2026-05-12",
            "preferred_time": "11:00",
            "message": "Want to discuss budget"
        }
        create_response = requests.post(f"{BASE_URL}/api/requests", json=payload)
        request_id = create_response.json()["id"]
        
        # Accept the request
        accept_response = requests.put(f"{BASE_URL}/api/requests/{request_id}/accept")
        assert accept_response.status_code == 200
        appointment = accept_response.json()
        
        # Verify appointment was created
        assert "id" in appointment
        assert appointment["client_name"] == payload["customer_name"]
        assert appointment["date"] == payload["preferred_date"]
        assert appointment["time_slot"] == payload["preferred_time"]
        assert appointment["notes"] == payload["message"]
        assert appointment["status"] == "upcoming"
        assert "Meeting with" in appointment["title"]
        
        appointment_id = appointment["id"]
        print(f"✓ Accept request created appointment: {appointment_id}")
        
        # Verify request status changed to accepted
        request_check = requests.get(f"{BASE_URL}/api/requests/{request_id}")
        assert request_check.status_code == 200
        updated_request = request_check.json()
        assert updated_request["status"] == "accepted"
        print(f"✓ Request status updated to 'accepted'")
        
        # Verify appointment exists in appointments collection
        appointment_check = requests.get(f"{BASE_URL}/api/appointments/{appointment_id}")
        assert appointment_check.status_code == 200
        print(f"✓ Appointment persisted in database")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/appointments/{appointment_id}")
        requests.delete(f"{BASE_URL}/api/requests/{request_id}")
    
    def test_accept_already_accepted_request(self):
        """PUT /api/requests/{id}/accept - should return 400 if already accepted"""
        # Create and accept a request
        payload = {
            "customer_name": "TEST_Dave Brown",
            "customer_email": "test_dave@example.com",
            "preferred_date": "2026-05-13",
            "preferred_time": "15:00",
            "message": "Follow-up meeting"
        }
        create_response = requests.post(f"{BASE_URL}/api/requests", json=payload)
        request_id = create_response.json()["id"]
        
        # Accept once
        first_accept = requests.put(f"{BASE_URL}/api/requests/{request_id}/accept")
        assert first_accept.status_code == 200
        appointment_id = first_accept.json()["id"]
        
        # Try to accept again
        second_accept = requests.put(f"{BASE_URL}/api/requests/{request_id}/accept")
        assert second_accept.status_code == 400
        error_data = second_accept.json()
        assert "already accepted" in error_data["detail"].lower()
        print("✓ Cannot accept already accepted request (returns 400)")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/appointments/{appointment_id}")
        requests.delete(f"{BASE_URL}/api/requests/{request_id}")
    
    def test_accept_nonexistent_request(self):
        """PUT /api/requests/{id}/accept - should return 404 for invalid ID"""
        response = requests.put(f"{BASE_URL}/api/requests/nonexistent-id-12345/accept")
        assert response.status_code == 404
        print("✓ Accept nonexistent request returns 404")
    
    def test_suggest_alternative_updates_request(self):
        """PUT /api/requests/{id}/suggest - should update request with suggested date/time"""
        # Create a request
        payload = {
            "customer_name": "TEST_Eve Davis",
            "customer_email": "test_eve@example.com",
            "preferred_date": "2026-05-14",
            "preferred_time": "09:00",
            "message": "Initial consultation"
        }
        create_response = requests.post(f"{BASE_URL}/api/requests", json=payload)
        request_id = create_response.json()["id"]
        
        # Suggest alternative
        suggest_payload = {
            "suggested_date": "2026-05-15",
            "suggested_time": "10:30",
            "note": "This time works better for me"
        }
        suggest_response = requests.put(
            f"{BASE_URL}/api/requests/{request_id}/suggest",
            json=suggest_payload
        )
        assert suggest_response.status_code == 200
        updated = suggest_response.json()
        
        # Verify response
        assert updated["id"] == request_id
        assert updated["status"] == "alternative_offered"
        assert updated["suggested_date"] == suggest_payload["suggested_date"]
        assert updated["suggested_time"] == suggest_payload["suggested_time"]
        assert updated["suggested_note"] == suggest_payload["note"]
        print(f"✓ Suggest alternative updated request to 'alternative_offered'")
        
        # Verify persistence
        get_response = requests.get(f"{BASE_URL}/api/requests/{request_id}")
        fetched = get_response.json()
        assert fetched["status"] == "alternative_offered"
        assert fetched["suggested_date"] == suggest_payload["suggested_date"]
        assert fetched["suggested_time"] == suggest_payload["suggested_time"]
        print(f"✓ Verified suggestion persistence")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/requests/{request_id}")
    
    def test_suggest_alternative_without_note(self):
        """PUT /api/requests/{id}/suggest - note is optional"""
        # Create a request
        payload = {
            "customer_name": "TEST_Frank Miller",
            "customer_email": "test_frank@example.com",
            "preferred_date": "2026-05-16",
            "preferred_time": "13:00",
            "message": "Project review"
        }
        create_response = requests.post(f"{BASE_URL}/api/requests", json=payload)
        request_id = create_response.json()["id"]
        
        # Suggest without note
        suggest_payload = {
            "suggested_date": "2026-05-17",
            "suggested_time": "14:00"
        }
        suggest_response = requests.put(
            f"{BASE_URL}/api/requests/{request_id}/suggest",
            json=suggest_payload
        )
        assert suggest_response.status_code == 200
        updated = suggest_response.json()
        assert updated["status"] == "alternative_offered"
        assert updated["suggested_note"] == ""
        print("✓ Suggest alternative works without note (optional field)")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/requests/{request_id}")
    
    def test_suggest_nonexistent_request(self):
        """PUT /api/requests/{id}/suggest - should return 404 for invalid ID"""
        suggest_payload = {
            "suggested_date": "2026-05-18",
            "suggested_time": "10:00"
        }
        response = requests.put(
            f"{BASE_URL}/api/requests/nonexistent-id-12345/suggest",
            json=suggest_payload
        )
        assert response.status_code == 404
        print("✓ Suggest for nonexistent request returns 404")
    
    def test_decline_request_deletes_it(self):
        """DELETE /api/requests/{id} - should delete the request"""
        # Create a request
        payload = {
            "customer_name": "TEST_Grace Lee",
            "customer_email": "test_grace@example.com",
            "preferred_date": "2026-05-19",
            "preferred_time": "16:00",
            "message": "Consultation needed"
        }
        create_response = requests.post(f"{BASE_URL}/api/requests", json=payload)
        request_id = create_response.json()["id"]
        
        # Decline (delete) the request
        delete_response = requests.delete(f"{BASE_URL}/api/requests/{request_id}")
        assert delete_response.status_code == 200
        data = delete_response.json()
        assert "message" in data
        print(f"✓ Declined request: {request_id}")
        
        # Verify deletion
        get_response = requests.get(f"{BASE_URL}/api/requests/{request_id}")
        assert get_response.status_code == 404
        print("✓ Verified deletion: request no longer exists")
    
    def test_decline_nonexistent_request(self):
        """DELETE /api/requests/{id} - should return 404 for invalid ID"""
        response = requests.delete(f"{BASE_URL}/api/requests/nonexistent-id-12345")
        assert response.status_code == 404
        print("✓ Decline nonexistent request returns 404")

class TestDataValidation:
    """Test data validation for requests"""
    
    def test_create_request_missing_required_fields(self):
        """POST /api/requests - should validate required fields"""
        # Missing customer_email
        payload = {
            "customer_name": "TEST_Invalid",
            "preferred_date": "2026-05-20",
            "preferred_time": "10:00"
        }
        response = requests.post(f"{BASE_URL}/api/requests", json=payload)
        assert response.status_code == 422  # Validation error
        print("✓ Validation: missing required fields returns 422")
    
    def test_suggest_missing_required_fields(self):
        """PUT /api/requests/{id}/suggest - should validate required fields"""
        # Create a request first
        payload = {
            "customer_name": "TEST_Temp",
            "customer_email": "test_temp@example.com",
            "preferred_date": "2026-05-21",
            "preferred_time": "10:00"
        }
        create_response = requests.post(f"{BASE_URL}/api/requests", json=payload)
        request_id = create_response.json()["id"]
        
        # Try to suggest without required fields
        suggest_payload = {
            "suggested_date": "2026-05-22"
            # Missing suggested_time
        }
        response = requests.put(
            f"{BASE_URL}/api/requests/{request_id}/suggest",
            json=suggest_payload
        )
        assert response.status_code == 422  # Validation error
        print("✓ Validation: suggest missing required fields returns 422")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/requests/{request_id}")
