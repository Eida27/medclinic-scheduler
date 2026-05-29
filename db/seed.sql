INSERT INTO students (student_number, first_name, last_name, college, year_level, priority_status)
VALUES
  ('2026-0001', 'Ana', 'Dela Cruz', 'College of Computer Studies', 4, 'graduating'),
  ('2026-0002', 'Marco', 'Santos', 'College of Engineering', 3, 'regular'),
  ('2026-0003', 'Lia', 'Reyes', 'College of Nursing', 4, 'ojt'),
  ('2026-0004', 'Paolo', 'Garcia', 'College of Business and Accountancy', 2, 'regular'),
  ('2026-0005', 'Mika', 'Villanueva', 'College of Education', 4, 'tour'),
  ('2026-0006', 'Rafael', 'Lopez', 'College of Arts and Sciences', 1, 'regular');

INSERT INTO doctors (full_name, is_available)
VALUES
  ('Dr. Maria Gonzales', true),
  ('Dr. Roberto Cruz', true),
  ('Dr. Elena Yap', true);

INSERT INTO schedule_days (service_type, schedule_date, capacity, arrival_window)
VALUES
  ('physical', DATE '2026-06-01', 50, 'Morning'),
  ('laboratory', DATE '2026-06-01', 80, 'Morning');
