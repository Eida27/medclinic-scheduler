# Codex Implementation Plan: Rebuild MedClinic Scheduler Around Coordinator-Provided Schedules

## Project Context

Repository: `Eida27/medclinic-scheduler`

This project must be rebuilt from the old automatic scheduling concept into a coordinator-based clinic appointment management system.

The adviser clarified two important scope changes:

1. Remove the priority feature.
   - Coordinators already decide priority dates before handing data to the clinic.
   - The system should not rank students by `regular`, `ojt`, `graduating`, `tour`, deadline, or urgency.

2. Do not automatically decide lab or physical examination dates.
   - Lab and physical examination schedule dates are already prepared by coordinators.
   - Coordinators hand over this data to the laboratory clinic and physical clinic.
   - The system should receive, validate, display, track, and report those schedules.

Also remove the doctor unavailability feature completely.

The doctor unavailability/recompute feature does not make sense for this revised workflow because the system should not automatically move student appointments when a doctor is unavailable. If rescheduling is needed, clinic staff should handle it manually with an explicit reschedule action and reason.

---

## New System Goal

Build a clinic appointment management system that allows the CPU Medical Clinic to manage coordinator-provided student laboratory and physical examination schedules.

The system should answer these questions:

- What schedule did the coordinator give to the clinic?
- Is the submitted schedule data valid?
- Who is scheduled for laboratory examination today?
- Who is scheduled for physical examination today?
- Who already checked in?
- Who already completed the service?
- Who did not show up?
- Which students are still pending?
- What reports can the clinic generate by date, college, service type, and status?

The system should not answer these questions anymore:

- Who should be prioritized?
- Which student should be scheduled first?
- What date should the system assign to a student?
- How should the system automatically recompute schedules when a doctor is unavailable?

---

## Tech Stack

Keep the existing tech stack:

- Frontend: Next.js App Router
- Backend: Next.js Route Handlers or Server Actions
- Database: PostgreSQL
- Database access: `pg` package
- Schema management: raw `.sql` files
- Deployment target: local network server

---

## High-Level Workflow

```text
Coordinator prepares student schedule data
        ↓
Clinic receives schedule handoff
        ↓
Clinic staff imports or encodes the schedule into the system
        ↓
System validates the data
        ↓
System creates lab and physical appointment records
        ↓
Laboratory clinic manages laboratory appointments
        ↓
Physical clinic manages physical examination appointments
        ↓
Clinic staff updates statuses: pending, checked-in, completed, no-show, cancelled, rescheduled
        ↓
System generates reports
```

---

## Features To Remove

Remove these old features completely:

### 1. Priority Feature

Delete priority-based scheduling logic.

Remove:

- `priority_status` enum
- `priority_status` column from `students`
- `deadline_date` column from `students`
- Any priority sorting logic
- Any urgency/deadline sorting logic
- Any UI column or chip that displays priority
- Any seed data that includes priority/deadline values

The system must not use these values anymore:

```text
regular
ojt
graduating
tour
```

### 2. Generate Schedule Feature

Remove the automatic schedule generation flow.

Delete or replace:

- `/api/generate-schedule`
- `generateSchedule()` function
- `buildAppointmentDrafts()` if it exists only for automatic generation
- `buildServiceAppointmentDrafts()` if it exists only for automatic generation
- `orderStudents()`
- `priorityRank`
- `URGENT_DEADLINE_WINDOW_DAYS`
- automatic weekday overflow logic
- the `Generate Schedule` button in the dashboard

The system should create appointments only from imported or manually encoded coordinator schedule data.

### 3. Doctor Unavailability Feature

Delete the doctor unavailability feature completely.

Remove:

- `doctor_unavailabilities` table
- `/api/doctor-unavailability` route
- doctor unavailability form/panel in the dashboard
- doctor unavailability recomputation logic
- `recordDoctorUnavailabilityAndRecompute()`
- `buildPhysicalUnavailabilityRecomputePlan()`
- `loadPhysicalScheduleDaysWithDoctorCapacity()` if only used for recomputation/generation
- `ensurePhysicalScheduleDayWithDoctorCapacity()` if only used for recomputation/generation
- `getEffectivePhysicalCapacity()` if only used for recomputation/generation
- tests related to doctor unavailability

Optional: keep a simple `doctors` table only if the physical clinic needs to assign a doctor manually to a physical exam appointment. Do not connect doctors to automatic rescheduling.

---

## New Core Features

### 1. Schedule Batch Management

A schedule batch represents one handoff from coordinators.

Example batch:

```text
Batch Name: CCS 4th Year Medical Exam Schedule - 1st Semester 2026
College: College of Computer Studies
Academic Year: 2026-2027
Semester: 1st Semester
Received From: College Coordinator
Received Date: 2026-06-15
Status: Draft / Imported / Validated / Active / Archived
```

Required pages:

```text
/batches
/batches/new
/batches/[id]
```

Required functionality:

- Create a schedule batch
- View all batches
- View appointments inside a batch
- Mark batch as active
- Archive old batches

### 2. Student Management

Students should be stored separately from appointments.

Required fields:

```text
student_number
first_name
last_name
college
program
year_level
```

Student number must remain the primary identifier.

Recommended format validation:

```text
XX-XXXX-XX
Example: 23-1212-97
```

Do not store priority fields in the student table.

### 3. Coordinator Schedule Intake

The system should support either manual encoding first or CSV import later.

For the first working version, implement manual encoding.

Required fields for each imported/encoded student schedule:

```text
student_number
first_name
last_name
college
program
year_level
laboratory_scheduled_date
physical_scheduled_date
laboratory_arrival_window
physical_arrival_window
remarks
```

When a student schedule is saved, create:

- one laboratory appointment if `laboratory_scheduled_date` exists
- one physical appointment if `physical_scheduled_date` exists

The system must not generate dates by itself.

### 4. Data Validation

Before saving or activating a batch, validate the coordinator-provided data.

Rules:

- Student number is required.
- Student number must follow the expected format.
- First name and last name are required.
- College is required.
- Year level is required.
- At least one of these must exist:
  - laboratory scheduled date
  - physical scheduled date
- The same student should not have duplicate laboratory appointments in the same active batch.
- The same student should not have duplicate physical appointments in the same active batch.
- Scheduled date must be a valid date.
- Arrival window must not be blank if a scheduled date is provided.

Validation results should be user-friendly.

Example validation messages:

```text
Student 23-1212-97 has no laboratory or physical schedule date.
Student 23-1213-98 has a duplicate laboratory appointment in this batch.
Student 23-1214-99 has an invalid student number format.
```

### 5. Laboratory Clinic Dashboard

Required route:

```text
/laboratory
```

Display laboratory appointments only.

Columns:

```text
Date
Queue Number
Student Number
Student Name
College
Program
Year Level
Arrival Window
Status
Remarks
Actions
```

Filters:

```text
Date
College
Status
Batch
```

Actions:

```text
Mark as Checked-in
Mark as Completed
Mark as No-show
Cancel
Reschedule
Edit remarks
```

### 6. Physical Clinic Dashboard

Required route:

```text
/physical
```

Display physical examination appointments only.

Columns:

```text
Date
Queue Number
Student Number
Student Name
College
Program
Year Level
Arrival Window
Assigned Doctor, optional
Status
Remarks
Actions
```

Filters:

```text
Date
College
Status
Batch
Doctor, optional
```

Actions:

```text
Mark as Checked-in
Assign doctor, optional
Mark as Completed
Mark as No-show
Cancel
Reschedule
Edit remarks
```

Important: assigning a doctor must not trigger automatic rescheduling.

### 7. Appointment Status Tracking

Use these appointment statuses:

```text
pending
checked_in
completed
no_show
cancelled
rescheduled
```

Default status:

```text
pending
```

Status rules:

- `pending` can become `checked_in`, `completed`, `no_show`, `cancelled`, or `rescheduled`.
- `checked_in` can become `completed`, `no_show`, or `cancelled`.
- `completed` should be treated as final unless an admin edits it.
- `no_show` can be rescheduled manually.
- `cancelled` can be rescheduled manually.
- `rescheduled` should point to a new appointment or store a rescheduled date depending on implementation.

Every status update should create an appointment log.

### 8. Manual Rescheduling

Manual rescheduling replaces automatic recomputation.

Required behavior:

- Clinic staff chooses an appointment.
- Clinic staff clicks `Reschedule`.
- Clinic staff selects a new date and arrival window.
- Clinic staff enters a reason.
- System updates the appointment date or creates a replacement appointment.
- System logs the old date, new date, and reason.

No automatic movement of other appointments.

### 9. Reports Module

Required route:

```text
/reports
```

Reports:

- Daily laboratory appointment list
- Daily physical examination list
- Completed appointments by date range
- Pending appointments by date range
- No-show appointments by date range
- College summary
- Batch summary
- Service type summary

Report filters:

```text
Date from
Date to
College
Service type
Status
Batch
```

Allow export later if possible:

```text
Print
CSV export
```

Start with on-screen reports first.

---

## Recommended Database Schema

Replace the old schema with this cleaner version.

```sql
DROP TABLE IF EXISTS appointment_logs;
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS schedule_batches;
DROP TABLE IF EXISTS doctors;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS users;

DROP TYPE IF EXISTS service_type;
DROP TYPE IF EXISTS appointment_status;
DROP TYPE IF EXISTS batch_status;
DROP TYPE IF EXISTS user_role;

CREATE TYPE service_type AS ENUM ('laboratory', 'physical');
CREATE TYPE appointment_status AS ENUM (
  'pending',
  'checked_in',
  'completed',
  'no_show',
  'cancelled',
  'rescheduled'
);
CREATE TYPE batch_status AS ENUM ('draft', 'imported', 'validated', 'active', 'archived');
CREATE TYPE user_role AS ENUM ('admin', 'coordinator', 'laboratory_staff', 'physical_staff');

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE,
  role user_role NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE students (
  student_number TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  college TEXT NOT NULL,
  program TEXT NOT NULL,
  year_level INTEGER NOT NULL CHECK (year_level BETWEEN 1 AND 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT students_student_number_format CHECK (student_number ~ '^[0-9]{2}-[0-9]{4}-[0-9]{2}$')
);

CREATE TABLE doctors (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE schedule_batches (
  id SERIAL PRIMARY KEY,
  batch_name TEXT NOT NULL,
  college TEXT,
  academic_year TEXT,
  semester TEXT,
  received_from TEXT,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status batch_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE appointments (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES schedule_batches(id) ON DELETE CASCADE,
  student_number TEXT NOT NULL REFERENCES students(student_number) ON DELETE CASCADE,
  service_type service_type NOT NULL,
  scheduled_date DATE NOT NULL,
  arrival_window TEXT NOT NULL DEFAULT 'Morning',
  queue_number INTEGER CHECK (queue_number IS NULL OR queue_number > 0),
  status appointment_status NOT NULL DEFAULT 'pending',
  assigned_doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
  remarks TEXT,
  rescheduled_from_appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT appointments_arrival_window_not_blank CHECK (length(trim(arrival_window)) > 0),
  CONSTRAINT appointments_student_service_batch_unique UNIQUE (batch_id, student_number, service_type)
);

CREATE TABLE appointment_logs (
  id SERIAL PRIMARY KEY,
  appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  old_status appointment_status,
  new_status appointment_status,
  old_scheduled_date DATE,
  new_scheduled_date DATE,
  remarks TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX appointments_batch_id_idx ON appointments(batch_id);
CREATE INDEX appointments_service_date_idx ON appointments(service_type, scheduled_date);
CREATE INDEX appointments_status_idx ON appointments(status);
CREATE INDEX appointments_student_number_idx ON appointments(student_number);
CREATE INDEX appointment_logs_appointment_id_idx ON appointment_logs(appointment_id);
```

---

## Suggested App Routes

Use these routes/pages:

```text
/
/batches
/batches/new
/batches/[id]
/students
/laboratory
/physical
/reports
```

Suggested API routes:

```text
/api/batches
/api/batches/[id]
/api/students
/api/appointments
/api/appointments/[id]
/api/appointments/[id]/status
/api/appointments/[id]/reschedule
/api/reports/summary
```

Do not recreate these routes:

```text
/api/generate-schedule
/api/doctor-unavailability
```

---

## Suggested File Structure

```text
src/
  app/
    page.tsx
    batches/
      page.tsx
      new/
        page.tsx
      [id]/
        page.tsx
    laboratory/
      page.tsx
    physical/
      page.tsx
    reports/
      page.tsx
    students/
      page.tsx
    api/
      batches/
        route.ts
        [id]/
          route.ts
      students/
        route.ts
      appointments/
        route.ts
        [id]/
          route.ts
          status/
            route.ts
          reschedule/
            route.ts
      reports/
        summary/
          route.ts
  components/
    AppointmentsTable.tsx
    BatchForm.tsx
    BatchList.tsx
    ClinicDashboard.tsx
    FiltersBar.tsx
    ReportsPanel.tsx
    StatusBadge.tsx
  lib/
    db.ts
    validation.ts
    appointments.ts
    batches.ts
    students.ts
    reports.ts
    error-message.ts
    date.ts
  styles/
```

---

## Implementation Phases

### Phase 1: Clean Old System

1. Remove priority/deadline schema.
2. Remove automatic schedule generation.
3. Remove doctor unavailability feature.
4. Remove old dashboard sections that depend on those features.
5. Replace README description.
6. Update tests to match the new workflow.

Acceptance criteria:

- No `priority_status` exists in database, UI, API, types, or tests.
- No `deadline_date` exists in database, UI, API, types, or tests.
- No `doctor_unavailabilities` table exists.
- No `/api/doctor-unavailability` route exists.
- No `Generate Schedule` button exists.
- No `/api/generate-schedule` route exists.

### Phase 2: New Database

1. Create the new schema in `db/schema.sql`.
2. Update `db/reset.sql` to reload the new schema and seed data.
3. Update `db/seed.sql` with sample batches, students, appointments, doctors, and logs.

Acceptance criteria:

- `psql -U postgres -d medclinic_scheduler -f db/reset.sql` works.
- Seed data creates at least:
  - 1 schedule batch
  - 6 students
  - laboratory appointments
  - physical appointments
  - optional doctors

### Phase 3: Data Access Layer

Create database functions in `src/lib/`:

```text
batches.ts
students.ts
appointments.ts
reports.ts
validation.ts
```

Required functions:

```ts
getBatches()
createBatch(input)
getBatchById(id)
getAppointments(filters)
createCoordinatorScheduleEntry(input)
updateAppointmentStatus(id, status, remarks)
rescheduleAppointment(id, input)
getReportSummary(filters)
validateCoordinatorScheduleEntry(input)
```

Acceptance criteria:

- Database logic is not scattered across UI components.
- All writes validate inputs before inserting/updating.
- Appointment status updates create logs.

### Phase 4: API Routes

Implement:

```text
GET /api/batches
POST /api/batches
GET /api/batches/[id]
GET /api/appointments
POST /api/appointments
PATCH /api/appointments/[id]/status
PATCH /api/appointments/[id]/reschedule
GET /api/reports/summary
```

Acceptance criteria:

- All API routes return JSON.
- Errors return useful messages.
- Invalid input returns status `400`.
- Missing records return status `404`.

### Phase 5: Main Pages

Build these pages:

#### `/`

Dashboard summary:

- Total appointments today
- Laboratory appointments today
- Physical appointments today
- Pending count
- Completed count
- No-show count

#### `/batches`

- List all schedule batches
- Show status
- Link to batch details

#### `/batches/new`

- Create batch
- Add coordinator schedule entries manually

#### `/batches/[id]`

- View batch information
- View all appointments under the batch
- Filter by service type and status

#### `/laboratory`

- Laboratory clinic dashboard
- Show laboratory appointments only
- Allow status updates and rescheduling

#### `/physical`

- Physical clinic dashboard
- Show physical examination appointments only
- Allow doctor assignment, status updates, and rescheduling

#### `/reports`

- Show summaries by date range, college, service type, and status

Acceptance criteria:

- The UI does not mention priority.
- The UI does not include a Generate Schedule button.
- The UI does not include doctor unavailability.
- Appointments come from coordinator-provided date fields.

### Phase 6: Tests

Update tests to cover the new workflow.

Test cases:

- Valid student number passes validation.
- Invalid student number fails validation.
- Creating a coordinator schedule entry creates appointments using provided dates.
- Duplicate student service appointment in the same batch is rejected.
- Updating status creates an appointment log.
- Rescheduling updates the appointment date and creates a log.
- Laboratory dashboard returns only laboratory appointments.
- Physical dashboard returns only physical appointments.

Run:

```powershell
npm test
npm run lint
npm run build
```

---

## UI Language Guidelines

Use these labels:

```text
Schedule Batch
Coordinator Handoff
Laboratory Appointments
Physical Examination Appointments
Appointment Status
Check-in
Completed
No-show
Reschedule
Remarks
Reports
```

Avoid these labels:

```text
Priority
Deadline
Generate Schedule
Auto Schedule
Doctor Unavailability
Recompute
Urgent
```

---

## Definition of Done

The rebuild is done when:

- Coordinators or clinic staff can create a schedule batch.
- Staff can encode coordinator-provided student schedules.
- The system creates lab and physical appointments using the provided dates.
- Laboratory clinic can manage laboratory appointments.
- Physical clinic can manage physical examination appointments.
- Appointment statuses can be updated.
- Manual rescheduling works.
- Appointment logs are created for important changes.
- Reports can be viewed by date, college, service type, status, and batch.
- No priority logic remains.
- No automatic schedule generation remains.
- No doctor unavailability feature remains.

---

## Important Instruction For Codex

Do not try to preserve the old scheduling algorithm.

The old system was based on automatically generating appointments using priority, deadline, capacity, weekday overflow, and doctor availability. That is no longer the correct system behavior.

Rebuild the project around this rule:

```text
The coordinator decides the schedule date.
The system receives, validates, tracks, and reports the schedule.
```

This is the new source of truth for implementation.
