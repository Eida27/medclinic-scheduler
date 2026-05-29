DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS schedule_days;
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

CREATE TABLE schedule_days (
  id SERIAL PRIMARY KEY,
  service_type service_type NOT NULL,
  schedule_date DATE NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  arrival_window TEXT NOT NULL DEFAULT 'Morning',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT schedule_days_arrival_window_not_blank CHECK (length(trim(arrival_window)) > 0),
  CONSTRAINT schedule_days_service_date_unique UNIQUE (service_type, schedule_date),
  CONSTRAINT schedule_days_id_service_unique UNIQUE (id, service_type)
);

CREATE TABLE appointments (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  schedule_day_id INTEGER NOT NULL,
  service_type service_type NOT NULL,
  queue_number INTEGER NOT NULL CHECK (queue_number > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT appointments_schedule_day_service_fk
    FOREIGN KEY (schedule_day_id, service_type)
    REFERENCES schedule_days(id, service_type)
    ON DELETE CASCADE,
  CONSTRAINT appointments_student_service_unique UNIQUE (student_id, service_type),
  CONSTRAINT appointments_schedule_day_queue_unique UNIQUE (schedule_day_id, queue_number)
);

CREATE INDEX appointments_schedule_day_id_idx ON appointments(schedule_day_id);
CREATE INDEX schedule_days_service_date_idx ON schedule_days(service_type, schedule_date);
