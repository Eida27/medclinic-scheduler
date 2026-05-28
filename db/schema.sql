DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS time_slots;
DROP TABLE IF EXISTS doctors;
DROP TABLE IF EXISTS students;

DROP TYPE IF EXISTS service_type;
DROP TYPE IF EXISTS priority_status;

CREATE TYPE service_type AS ENUM ('physical', 'laboratory');
CREATE TYPE priority_status AS ENUM ('regular', 'ojt', 'graduating', 'tour');

CREATE TABLE students (
  id SERIAL PRIMARY KEY,
  student_number TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  college TEXT NOT NULL,
  year_level INTEGER NOT NULL CHECK (year_level BETWEEN 1 AND 5),
  priority_status priority_status NOT NULL DEFAULT 'regular',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE doctors (
  id SERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE time_slots (
  id SERIAL PRIMARY KEY,
  service_type service_type NOT NULL,
  doctor_id INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
  slot_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT time_slots_valid_time CHECK (start_time < end_time)
);

CREATE TABLE appointments (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  time_slot_id INTEGER NOT NULL REFERENCES time_slots(id) ON DELETE CASCADE,
  service_type service_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT appointments_student_service_unique UNIQUE (student_id, service_type)
);

CREATE INDEX appointments_time_slot_id_idx ON appointments(time_slot_id);
CREATE INDEX time_slots_service_date_time_idx ON time_slots(service_type, slot_date, start_time);
