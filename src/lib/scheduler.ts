import type { PoolClient } from "pg";

import { getPool } from "./db";

export type PriorityStatus = "regular" | "ojt" | "graduating" | "tour";
export type ServiceType = "physical" | "laboratory";

export type SchedulableStudent = {
  id: number;
  priorityStatus: PriorityStatus;
};

export type AvailableSlot = {
  id: number;
  serviceType: ServiceType;
  capacity: number;
};

export type AppointmentDraft = {
  studentId: number;
  timeSlotId: number;
  serviceType: ServiceType;
};

export type GenerateScheduleResult = {
  physicalCreated: number;
  laboratoryCreated: number;
  totalCreated: number;
};

export type AppointmentRow = {
  id: number;
  studentNumber: string;
  studentName: string;
  college: string;
  yearLevel: number;
  priorityStatus: PriorityStatus;
  serviceType: ServiceType;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  doctorName: string | null;
};

const priorityRank: Record<PriorityStatus, number> = {
  graduating: 0,
  ojt: 1,
  tour: 2,
  regular: 3,
};

export function buildAppointmentDrafts({
  students,
  physicalSlots,
  laboratorySlots,
}: {
  students: SchedulableStudent[];
  physicalSlots: AvailableSlot[];
  laboratorySlots: AvailableSlot[];
}): AppointmentDraft[] {
  const orderedStudents = [...students].sort((left, right) => {
    const priorityDifference =
      priorityRank[left.priorityStatus] - priorityRank[right.priorityStatus];

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    return left.id - right.id;
  });

  const physicalQueue = expandSlots(physicalSlots, "physical");
  const laboratoryQueue = expandSlots(laboratorySlots, "laboratory");

  if (physicalQueue.length < orderedStudents.length) {
    throw new Error("Not enough physical examination slots for all students.");
  }

  if (laboratoryQueue.length < orderedStudents.length) {
    throw new Error("Not enough laboratory slots for all students.");
  }

  return orderedStudents.flatMap((student, index) => [
    {
      studentId: student.id,
      timeSlotId: physicalQueue[index],
      serviceType: "physical" as const,
    },
    {
      studentId: student.id,
      timeSlotId: laboratoryQueue[index],
      serviceType: "laboratory" as const,
    },
  ]);
}

export async function generateSchedule(): Promise<GenerateScheduleResult> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM appointments");

    const students = await loadStudents(client);
    const physicalSlots = await loadPhysicalSlots(client);
    const laboratorySlots = await loadLaboratorySlots(client);

    const drafts = buildAppointmentDrafts({
      students,
      physicalSlots,
      laboratorySlots,
    });

    for (const draft of drafts) {
      await client.query(
        `
          INSERT INTO appointments (student_id, time_slot_id, service_type)
          VALUES ($1, $2, $3)
        `,
        [draft.studentId, draft.timeSlotId, draft.serviceType],
      );
    }

    await client.query("COMMIT");

    const physicalCreated = drafts.filter(
      (draft) => draft.serviceType === "physical",
    ).length;
    const laboratoryCreated = drafts.filter(
      (draft) => draft.serviceType === "laboratory",
    ).length;

    return {
      physicalCreated,
      laboratoryCreated,
      totalCreated: drafts.length,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getAppointments(): Promise<AppointmentRow[]> {
  const result = await getPool().query<AppointmentRow>(`
    SELECT
      a.id,
      s.student_number AS "studentNumber",
      s.first_name || ' ' || s.last_name AS "studentName",
      s.college,
      s.year_level AS "yearLevel",
      s.priority_status AS "priorityStatus",
      a.service_type AS "serviceType",
      ts.slot_date::text AS "appointmentDate",
      to_char(ts.start_time, 'HH24:MI') AS "startTime",
      to_char(ts.end_time, 'HH24:MI') AS "endTime",
      d.full_name AS "doctorName"
    FROM appointments a
    JOIN students s ON s.id = a.student_id
    JOIN time_slots ts ON ts.id = a.time_slot_id
    LEFT JOIN doctors d ON d.id = ts.doctor_id
    ORDER BY
      ts.slot_date,
      ts.start_time,
      CASE a.service_type WHEN 'physical' THEN 0 ELSE 1 END,
      s.last_name,
      s.first_name
  `);

  return result.rows;
}

async function loadStudents(client: PoolClient): Promise<SchedulableStudent[]> {
  const result = await client.query<SchedulableStudent>(`
    SELECT
      id,
      priority_status AS "priorityStatus"
    FROM students
    ORDER BY id
  `);

  return result.rows;
}

async function loadPhysicalSlots(client: PoolClient): Promise<AvailableSlot[]> {
  const result = await client.query<AvailableSlot>(`
    SELECT
      ts.id,
      ts.service_type AS "serviceType",
      ts.capacity
    FROM time_slots ts
    JOIN doctors d ON d.id = ts.doctor_id
    WHERE ts.service_type = 'physical'
      AND d.is_available = true
    ORDER BY ts.slot_date, ts.start_time, ts.id
  `);

  return result.rows;
}

async function loadLaboratorySlots(client: PoolClient): Promise<AvailableSlot[]> {
  const result = await client.query<AvailableSlot>(`
    SELECT
      id,
      service_type AS "serviceType",
      capacity
    FROM time_slots
    WHERE service_type = 'laboratory'
    ORDER BY slot_date, start_time, id
  `);

  return result.rows;
}

function expandSlots(slots: AvailableSlot[], serviceType: ServiceType): number[] {
  return slots.flatMap((slot) => {
    if (slot.serviceType !== serviceType) {
      throw new Error(`Expected ${serviceType} slot but received ${slot.serviceType}.`);
    }

    return Array.from({ length: slot.capacity }, () => slot.id);
  });
}
