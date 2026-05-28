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

INSERT INTO time_slots (service_type, doctor_id, slot_date, start_time, end_time, capacity)
SELECT 'physical', d.id, slot_date, start_time::time, end_time::time, 1
FROM doctors d
CROSS JOIN (
  VALUES
    (DATE '2026-06-01', '08:00', '08:30'),
    (DATE '2026-06-01', '08:30', '09:00'),
    (DATE '2026-06-01', '09:00', '09:30')
) AS slots(slot_date, start_time, end_time)
WHERE d.is_available = true;

INSERT INTO time_slots (service_type, doctor_id, slot_date, start_time, end_time, capacity)
VALUES
  ('laboratory', NULL, DATE '2026-06-01', '08:00', '08:30', 2),
  ('laboratory', NULL, DATE '2026-06-01', '08:30', '09:00', 2),
  ('laboratory', NULL, DATE '2026-06-01', '09:00', '09:30', 2),
  ('laboratory', NULL, DATE '2026-06-01', '09:30', '10:00', 2);
