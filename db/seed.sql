INSERT INTO students (
  student_number,
  first_name,
  last_name,
  college,
  year_level,
  priority_status,
  deadline_date
)
VALUES
  ('23-1212-97', 'Ana', 'Dela Cruz', 'College of Computer Studies', 4, 'graduating', DATE '2026-06-02'),
  ('23-1213-98', 'Marco', 'Santos', 'College of Engineering', 3, 'regular', NULL),
  ('23-1214-99', 'Lia', 'Reyes', 'College of Nursing', 4, 'ojt', DATE '2026-07-01'),
  ('23-1215-00', 'Paolo', 'Garcia', 'College of Business and Accountancy', 2, 'regular', NULL),
  ('23-1216-01', 'Mika', 'Villanueva', 'College of Education', 4, 'tour', DATE '2026-07-15'),
  ('23-1217-02', 'Rafael', 'Lopez', 'College of Arts and Sciences', 1, 'regular', NULL);

INSERT INTO doctors (full_name, is_available)
VALUES
  ('Dr. Maria Gonzales', true),
  ('Dr. Roberto Cruz', true),
  ('Dr. Elena Yap', true);

INSERT INTO schedule_days (service_type, schedule_date, capacity, arrival_window)
VALUES
  ('physical', DATE '2026-06-01', 50, 'Morning'),
  ('laboratory', DATE '2026-06-01', 80, 'Morning');
