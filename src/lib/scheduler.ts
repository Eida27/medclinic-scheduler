import type { PoolClient } from "pg";

import { getPool } from "./db";

export type PriorityStatus = "regular" | "ojt" | "graduating" | "tour";
export type ServiceType = "physical" | "laboratory";

export type SchedulableStudent = {
  id: number;
  priorityStatus: PriorityStatus;
  deadlineDate: string | null;
};

export type ScheduleDay = {
  id: number;
  serviceType: ServiceType;
  scheduleDate: string;
  capacity: number;
  arrivalWindow: string;
};

export type AppointmentDraft = {
  studentId: number;
  scheduleDayId: number;
  serviceType: ServiceType;
  queueNumber: number;
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
  deadlineDate: string | null;
  serviceType: ServiceType;
  appointmentDate: string;
  queueNumber: number;
  arrivalWindow: string;
};

export const DEFAULT_SERVICE_CAPACITY: Record<ServiceType, number> = {
  physical: 50,
  laboratory: 80,
};

export const DEFAULT_ARRIVAL_WINDOW = "Morning";

const priorityRank: Record<PriorityStatus, number> = {
  tour: 0,
  ojt: 1,
  graduating: 2,
  regular: 3,
};

const URGENT_DEADLINE_WINDOW_DAYS = 7;

type GetOrCreateScheduleDay = (
  serviceType: ServiceType,
  scheduleDate: string,
) => ScheduleDay | Promise<ScheduleDay>;

export async function buildAppointmentDrafts({
  students,
  physicalScheduleDays,
  laboratoryScheduleDays,
  getOrCreateScheduleDay,
}: {
  students: SchedulableStudent[];
  physicalScheduleDays: ScheduleDay[];
  laboratoryScheduleDays: ScheduleDay[];
  getOrCreateScheduleDay: GetOrCreateScheduleDay;
}): Promise<AppointmentDraft[]> {
  const urgencyReferenceDate = getEarliestWeekdayScheduleDate([
    ...physicalScheduleDays,
    ...laboratoryScheduleDays,
  ]);
  const orderedStudents = orderStudents(students, urgencyReferenceDate);

  const physicalDrafts = await buildServiceAppointmentDrafts({
    students: orderedStudents,
    serviceType: "physical",
    scheduleDays: physicalScheduleDays,
    getOrCreateScheduleDay,
  });
  const laboratoryDrafts = await buildServiceAppointmentDrafts({
    students: orderedStudents,
    serviceType: "laboratory",
    scheduleDays: laboratoryScheduleDays,
    getOrCreateScheduleDay,
  });

  return [...physicalDrafts, ...laboratoryDrafts];
}

export async function generateSchedule(): Promise<GenerateScheduleResult> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM appointments");

    const students = await loadStudents(client);
    const physicalScheduleDays = await loadScheduleDays(client, "physical");
    const laboratoryScheduleDays = await loadScheduleDays(client, "laboratory");

    const drafts = await buildAppointmentDrafts({
      students,
      physicalScheduleDays,
      laboratoryScheduleDays,
      getOrCreateScheduleDay: (serviceType, scheduleDate) =>
        ensureScheduleDay(client, serviceType, scheduleDate),
    });

    for (const draft of drafts) {
      await client.query(
        `
          INSERT INTO appointments (
            student_id,
            schedule_day_id,
            service_type,
            queue_number
          )
          VALUES ($1, $2, $3, $4)
        `,
        [
          draft.studentId,
          draft.scheduleDayId,
          draft.serviceType,
          draft.queueNumber,
        ],
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
      s.deadline_date::text AS "deadlineDate",
      a.service_type AS "serviceType",
      sd.schedule_date::text AS "appointmentDate",
      a.queue_number AS "queueNumber",
      sd.arrival_window AS "arrivalWindow"
    FROM appointments a
    JOIN students s ON s.id = a.student_id
    JOIN schedule_days sd ON sd.id = a.schedule_day_id
    ORDER BY
      sd.schedule_date,
      CASE a.service_type WHEN 'physical' THEN 0 ELSE 1 END,
      a.queue_number,
      s.last_name,
      s.first_name
  `);

  return result.rows;
}

async function loadStudents(client: PoolClient): Promise<SchedulableStudent[]> {
  const result = await client.query<SchedulableStudent>(`
    SELECT
      id,
      priority_status AS "priorityStatus",
      deadline_date::text AS "deadlineDate"
    FROM students
    ORDER BY id
  `);

  return result.rows;
}

async function loadScheduleDays(
  client: PoolClient,
  serviceType: ServiceType,
): Promise<ScheduleDay[]> {
  const result = await client.query<ScheduleDay>(
    `
      SELECT
        id,
        service_type AS "serviceType",
        schedule_date::text AS "scheduleDate",
        capacity,
        arrival_window AS "arrivalWindow"
      FROM schedule_days
      WHERE service_type = $1
      ORDER BY schedule_date, id
    `,
    [serviceType],
  );

  return result.rows;
}

async function ensureScheduleDay(
  client: PoolClient,
  serviceType: ServiceType,
  scheduleDate: string,
): Promise<ScheduleDay> {
  const existing = await client.query<ScheduleDay>(
    `
      SELECT
        id,
        service_type AS "serviceType",
        schedule_date::text AS "scheduleDate",
        capacity,
        arrival_window AS "arrivalWindow"
      FROM schedule_days
      WHERE service_type = $1
        AND schedule_date = $2
      LIMIT 1
    `,
    [serviceType, scheduleDate],
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const inserted = await client.query<ScheduleDay>(
    `
      INSERT INTO schedule_days (
        service_type,
        schedule_date,
        capacity,
        arrival_window
      )
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        service_type AS "serviceType",
        schedule_date::text AS "scheduleDate",
        capacity,
        arrival_window AS "arrivalWindow"
    `,
    [
      serviceType,
      scheduleDate,
      DEFAULT_SERVICE_CAPACITY[serviceType],
      DEFAULT_ARRIVAL_WINDOW,
    ],
  );

  return inserted.rows[0];
}

function orderStudents(
  students: SchedulableStudent[],
  urgencyReferenceDate: string | undefined,
) {
  const urgentDeadlineCutoff = urgencyReferenceDate
    ? addDays(urgencyReferenceDate, URGENT_DEADLINE_WINDOW_DAYS)
    : undefined;

  return [...students].sort((left, right) => {
    const leftIsUrgent = hasUrgentDeadline(left, urgentDeadlineCutoff);
    const rightIsUrgent = hasUrgentDeadline(right, urgentDeadlineCutoff);

    if (leftIsUrgent !== rightIsUrgent) {
      return leftIsUrgent ? -1 : 1;
    }

    if (leftIsUrgent && rightIsUrgent) {
      const deadlineDifference = compareDeadlineDates(
        left.deadlineDate,
        right.deadlineDate,
      );

      if (deadlineDifference !== 0) {
        return deadlineDifference;
      }
    }

    const priorityDifference =
      priorityRank[left.priorityStatus] - priorityRank[right.priorityStatus];

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    const deadlineDifference = compareDeadlineDates(
      left.deadlineDate,
      right.deadlineDate,
    );

    if (deadlineDifference !== 0) {
      return deadlineDifference;
    }

    return left.id - right.id;
  });
}

function getEarliestWeekdayScheduleDate(scheduleDays: ScheduleDay[]) {
  return scheduleDays
    .map((day) => day.scheduleDate)
    .filter(isWeekday)
    .sort((left, right) => left.localeCompare(right))[0];
}

function hasUrgentDeadline(
  student: SchedulableStudent,
  urgentDeadlineCutoff: string | undefined,
) {
  return Boolean(
    student.deadlineDate &&
      urgentDeadlineCutoff &&
      student.deadlineDate <= urgentDeadlineCutoff,
  );
}

function compareDeadlineDates(left: string | null, right: string | null) {
  if (left === right) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return left.localeCompare(right);
}

async function buildServiceAppointmentDrafts({
  students,
  serviceType,
  scheduleDays,
  getOrCreateScheduleDay,
}: {
  students: SchedulableStudent[];
  serviceType: ServiceType;
  scheduleDays: ScheduleDay[];
  getOrCreateScheduleDay: GetOrCreateScheduleDay;
}): Promise<AppointmentDraft[]> {
  const scheduleDaysByDate = new Map(
    scheduleDays
      .filter((day) => day.serviceType === serviceType)
      .map((day) => [day.scheduleDate, day]),
  );
  const firstScheduleDay = [...scheduleDaysByDate.values()]
    .filter((day) => isWeekday(day.scheduleDate))
    .sort((left, right) => left.scheduleDate.localeCompare(right.scheduleDate))[0];

  if (!firstScheduleDay) {
    throw new Error(`No weekday ${serviceType} schedule days are configured.`);
  }

  const drafts: AppointmentDraft[] = [];
  let currentDate = firstScheduleDay.scheduleDate;
  let currentScheduleDay = firstScheduleDay;
  let queueNumber = 1;

  for (const student of students) {
    while (queueNumber > currentScheduleDay.capacity) {
      currentDate = getNextWeekday(currentDate);
      currentScheduleDay = await resolveScheduleDay({
        serviceType,
        scheduleDate: currentDate,
        scheduleDaysByDate,
        getOrCreateScheduleDay,
      });
      queueNumber = 1;
    }

    drafts.push({
      studentId: student.id,
      scheduleDayId: currentScheduleDay.id,
      serviceType,
      queueNumber,
    });
    queueNumber += 1;
  }

  return drafts;
}

async function resolveScheduleDay({
  serviceType,
  scheduleDate,
  scheduleDaysByDate,
  getOrCreateScheduleDay,
}: {
  serviceType: ServiceType;
  scheduleDate: string;
  scheduleDaysByDate: Map<string, ScheduleDay>;
  getOrCreateScheduleDay: GetOrCreateScheduleDay;
}) {
  const existing = scheduleDaysByDate.get(scheduleDate);

  if (existing) {
    return existing;
  }

  const created = await getOrCreateScheduleDay(serviceType, scheduleDate);

  if (created.serviceType !== serviceType) {
    throw new Error(
      `Expected ${serviceType} schedule day but received ${created.serviceType}.`,
    );
  }

  if (created.scheduleDate !== scheduleDate) {
    throw new Error(
      `Expected schedule day ${scheduleDate} but received ${created.scheduleDate}.`,
    );
  }

  scheduleDaysByDate.set(scheduleDate, created);
  return created;
}

function getNextWeekday(dateText: string) {
  let nextDate = addDays(dateText, 1);

  while (!isWeekday(nextDate)) {
    nextDate = addDays(nextDate, 1);
  }

  return nextDate;
}

function isWeekday(dateText: string) {
  const day = parseDateOnly(dateText).getUTCDay();
  return day >= 1 && day <= 5;
}

function addDays(dateText: string, amount: number) {
  const date = parseDateOnly(dateText);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatDateOnly(date);
}

function parseDateOnly(dateText: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    throw new Error(`Expected date in YYYY-MM-DD format but received ${dateText}.`);
  }

  const [year, month, day] = dateText.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}
