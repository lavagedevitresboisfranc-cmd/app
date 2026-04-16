# Appointment Manager - PRD

## Overview
Mobile app to manage business/consulting appointments with calendar view and time slots.

## Tech Stack
- **Frontend**: React Native (Expo SDK 54) with Expo Router
- **Backend**: FastAPI (Python) with MongoDB
- **Design**: Swiss & High-Contrast minimal (black/white, 1px borders, Feather icons)

## Features
- **Calendar View**: Monthly calendar with date selection, shows appointments per day
- **Appointment CRUD**: Create, read, update, delete appointments
- **Status Management**: upcoming → completed / cancelled / reopen
- **Filter System**: All, Upcoming, Done, Cancelled filters on All Appointments tab
- **Detail View**: Full appointment info with edit/delete/status actions
- **Time Slot Picker**: Visual grid of available time slots (08:00–18:00)
- **Duration Picker**: 15m, 30m, 45m, 60m, 90m, 120m
- **Appointment Requests**: Customers submit requests from website form
  - Requests appear as "Pending" in the Requests tab
  - Accept: creates a confirmed appointment from the request
  - Suggest Alternative: propose a different date/time (stays pending)
  - Decline: removes the request
  - Filter by: Pending, Suggested, Accepted, All

## API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/appointments | List all (optional ?date=&status= filters) |
| POST | /api/appointments | Create new appointment |
| GET | /api/appointments/{id} | Get single appointment |
| PUT | /api/appointments/{id} | Update appointment |
| DELETE | /api/appointments/{id} | Delete appointment |
| POST | /api/appointments/seed | Seed sample data |
| POST | /api/requests | Submit appointment request (public, for website form) |
| GET | /api/requests | List all requests (optional ?status= filter) |
| GET | /api/requests/{id} | Get single request |
| PUT | /api/requests/{id}/accept | Accept request → creates appointment |
| PUT | /api/requests/{id}/suggest | Suggest alternative date/time |
| DELETE | /api/requests/{id} | Decline/delete request |

## Navigation
- Tab 1: Calendar (index) - Calendar + daily appointment list
- Tab 2: All - Full appointment list with filters
- Tab 3: New - Create appointment form
- Tab 4: Requests - Incoming appointment requests from customers
- Detail screen (hidden tab, navigated to from cards)
- Request detail screen (hidden tab, navigated to from request cards)

## Website Integration
To integrate with your website, add a form that sends a POST request to:
```
POST https://booking-hub-406.preview.emergentagent.com/api/requests
Content-Type: application/json

{
  "customer_name": "John Doe",
  "customer_email": "john@example.com",
  "preferred_date": "2026-04-20",
  "preferred_time": "10:00",
  "message": "I'd like to discuss project planning"
}
```

## No Authentication
App is open access, no login required.
