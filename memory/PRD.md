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

## API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/appointments | List all (optional ?date=&status= filters) |
| POST | /api/appointments | Create new appointment |
| GET | /api/appointments/{id} | Get single appointment |
| PUT | /api/appointments/{id} | Update appointment |
| DELETE | /api/appointments/{id} | Delete appointment |
| POST | /api/appointments/seed | Seed sample data |

## Navigation
- Tab 1: Calendar (index) - Calendar + daily appointment list
- Tab 2: All - Full appointment list with filters
- Tab 3: New - Create appointment form
- Detail screen (hidden tab, navigated to from cards)

## No Authentication
App is open access, no login required.
