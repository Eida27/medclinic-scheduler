import type { PoolClient } from "pg";

import { getPool } from "./db";

export type PriorityStatus = "regular" | "ojt" | "graduating" | "tour";
export type ServiceType = "physical" | "laboratory";

export type SchedulableStudent = {
  studentNumber: string;
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
  studentNumber: string;
  scheduleDayId: number;
  serviceType: ServiceType;
  queueNumber: number;
};

export type RecomputableAppointment = AppointmentDraft & {
  id: number;
  appointmentDate: string;
};

export type RecomputedAppointmentDraft = AppointmentDraft & {
  appointmentId: number;
  previousScheduleDayId: number;
  previousAppointmentDate: string;
  previousQueueNumber: number;
};

export type PhysicalUnavailabilityRecomputePlan = {
  drafts: RecomputedAppointmentDraft[];
  movedAppointments: number;
  affectedDates: string[];
  untouchedAppointmentIds: number[];
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

export type DoctorRow = {
  id: number;
  fullName: string;
  isAvailable: boolean;
  dailyPhysicalCapacity: number;
  unavailableDates: string[];
};

export type RecordDoctorUnavailabilityInput = {
  doctorId: number;
  unavailableDate: string;
  reason?: string | null;
};

export type RecordDoctorUnavailabilityResult = {
  movedAppointments: number;
  affectedDates: string[];
  appointments: AppointmentRow[];
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
const MAX_RECOMPUTE_WEEKDAY_HOPS = 260;

type GetOrCreateScheduleDay = (
  serviceType: ServiceType,
  scheduleDate: string,
) => ScheduleDay | Promise<ScheduleDay>;

type Queryable = {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
};

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

export async function buildPhysicalUnavailabilityRecomputePlan({
  appointments,
  firstAffectedDate,
  scheduleDays,
  getOrCreateScheduleDay,
}: {
  appointments: RecomputableAppointment[];
  firstAffectedDate: string;
  scheduleDays: ScheduleDay[];
  getOrCreateScheduleDay: GetOrCreateScheduleDay;
}): Promise<PhysicalUnavailabilityRecomputePlan> {
  parseDateOnly(firstAffectedDate);

  const affectedPhysicalAppointments = appointments
    .filter(
      (appointment) =>
        appointment.serviceType === "physical" &&
        appointment.appointmentDate >= firstAffectedDate,
    )
    .sort(compareRecomputableAppointments);
  const untouchedAppointmentIds = appointments
    .filter(
      (appointment) =>
        appointment.serviceType !== "physical" ||
        appointment.appointmentDate < firstAffectedDate,
    )
    .map((appointment) => appointment.id);

  const scheduleDaysByDate = new Map(
    scheduleDays
      .filter((day) => day.serviceType === "physical")
      .map((day) => [day.scheduleDate, day]),
  );
  const affectedDates = new Set<string>([firstAffectedDate]);
  const drafts: RecomputedAppointmentDraft[] = [];

  let currentDate = firstAffectedDate;
  let currentScheduleDay = await resolveScheduleDay({
    serviceType: "physical",
    scheduleDate: currentDate,
    scheduleDaysByDate,
    getOrCreateScheduleDay,
  });
  let queueNumber = 1;
  let weekdayHops = 0;

  for (const appointment of affectedPhysicalAppointments) {
    while (
      currentScheduleDay.capacity <= 0 ||
      queueNumber > currentScheduleDay.capacity
    ) {
      currentDate = getNextWeekday(currentDate);
      currentScheduleDay = await resolveScheduleDay({
        serviceType: "physical",
        scheduleDate: currentDate,
        scheduleDaysByDate,
        getOrCreateScheduleDay,
      });
      queueNumber = 1;
      weekdayHops += 1;

      if (weekdayHops > MAX_RECOMPUTE_WEEKDAY_HOPS) {
        throw new Error("No physical capacity is available for recompute.");
      }
    }

    drafts.push({
      appointmentId: appointment.id,
      studentNumber: appointment.studentNumber,
      scheduleDayId: currentScheduleDay.id,
      serviceType: "physical",
      queueNumber,
      previousScheduleDayId: appointment.scheduleDayId,
      previousAppointmentDate: appointment.appointmentDate,
      previousQueueNumber: appointment.queueNumber,
    });
    affectedDates.add(appointment.appointmentDate);
    affectedDates.add(currentDate);
    queueNumber += 1;
  }

  return {
    drafts,
    movedAppointments: drafts.filter(
      (draft) =>
        draft.scheduleDayId !== draft.previousScheduleDayId ||
        draft.queueNumber !== draft.previousQueueNumber,
    ).length,
    affectedDates: [...affectedDates].sort(),
    untouchedAppointmentIds,
  };
}

export async function generateSchedule(): Promise<GenerateScheduleResult> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM appointments");

    const students = await loadStudents(client);
    const physicalScheduleDays =
      await loadPhysicalScheduleDaysWithDoctorCapacity(client);
    const laboratoryScheduleDays = await loadScheduleDays(client, "laboratory");

    const drafts = await buildAppointmentDrafts({
      students,
      physicalScheduleDays,
      laboratoryScheduleDays,
      getOrCreateScheduleDay: (serviceType, scheduleDate) => {
        if (serviceType === "physical") {
          return ensurePhysicalScheduleDayWithDoctorCapacity(
            client,
            scheduleDate,
          );
        }

        return ensureScheduleDay(client, serviceType, scheduleDate);
      },
    });

    await insertAppointmentDrafts(client, drafts);

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

export async function recordDoctorUnavailabilityAndRecompute({
  doctorId,
  unavailableDate,
  reason,
}: RecordDoctorUnavailabilityInput): Promise<RecordDoctorUnavailabilityResult> {
  validateDoctorUnavailabilityInput({ doctorId, unavailableDate, reason });

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await ensureDoctorExists(client, doctorId);
    await client.query(
      `
        INSERT INTO doctor_unavailabilities (
          doctor_id,
          unavailable_date,
          reason
        )
        VALUES ($1, $2, $3)
        ON CONFLICT (doctor_id, unavailable_date)
        DO UPDATE SET reason = EXCLUDED.reason
      `,
      [doctorId, unavailableDate, normalizeOptionalText(reason)],
    );

    const scheduleDays =
      await loadPhysicalScheduleDaysWithDoctorCapacity(client);
    const appointments = await loadRecomputableAppointments(client);
    const recomputePlan = await buildPhysicalUnavailabilityRecomputePlan({
      appointments,
      firstAffectedDate: unavailableDate,
      scheduleDays,
      getOrCreateScheduleDay: (serviceType, scheduleDate) => {
        if (serviceType !== "physical") {
          return ensureScheduleDay(client, serviceType, scheduleDate);
        }

        return ensurePhysicalScheduleDayWithDoctorCapacity(
          client,
          scheduleDate,
        );
      },
    });

    if (recomputePlan.drafts.length > 0) {
      await client.query(
        "DELETE FROM appointments WHERE id = ANY($1::int[])",
        [recomputePlan.drafts.map((draft) => draft.appointmentId)],
      );
      await insertAppointmentDrafts(client, recomputePlan.drafts);
    }

    const appointmentRows = await loadAppointmentRows(client);
    await client.query("COMMIT");

    return {
      movedAppointments: recomputePlan.movedAppointments,
      affectedDates: recomputePlan.affectedDates,
      appointments: appointmentRows,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getDoctors(): Promise<DoctorRow[]> {
  const result = await getPool().query<DoctorRow>(`
    SELECT
      d.id,
      d.full_name AS "fullName",
      d.is_available AS "isAvailable",
      d.daily_physical_capacity AS "dailyPhysicalCapacity",
      COALESCE(
        json_agg(du.unavailable_date::text ORDER BY du.unavailable_date)
          FILTER (WHERE du.id IS NOT NULL),
        '[]'::json
      ) AS "unavailableDates"
    FROM doctors d
    LEFT JOIN doctor_unavailabilities du ON du.doctor_id = d.id
    GROUP BY d.id
    ORDER BY d.full_name
  `);

  return result.rows.map((doctor) => ({
    ...doctor,
    unavailableDates: Array.isArray(doctor.unavailableDates)
      ? doctor.unavailableDates
      : [],
  }));
}

export async function getAppointments(): Promise<AppointmentRow[]> {
  return loadAppointmentRows(getPool());
}

async function loadAppointmentRows(queryable: Queryable): Promise<AppointmentRow[]> {
  const result = await queryable.query<AppointmentRow>(`
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
    JOIN students s ON s.student_number = a.student_number
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
      student_number AS "studentNumber",
      priority_status AS "priorityStatus",
      deadline_date::text AS "deadlineDate"
    FROM students
    ORDER BY student_number
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

async function loadPhysicalScheduleDaysWithDoctorCapacity(
  client: PoolClient,
): Promise<ScheduleDay[]> {
  const days = await loadScheduleDays(client, "physical");
  const adjustedDays: ScheduleDay[] = [];

  for (const day of days) {
    adjustedDays.push(
      await ensurePhysicalScheduleDayWithDoctorCapacity(
        client,
        day.scheduleDate,
        day.capacity,
      ),
    );
  }

  return adjustedDays;
}

async function loadRecomputableAppointments(
  client: PoolClient,
): Promise<RecomputableAppointment[]> {
  const result = await client.query<RecomputableAppointment>(`
    SELECT
      a.id,
      a.student_number AS "studentNumber",
      a.schedule_day_id AS "scheduleDayId",
      a.service_type AS "serviceType",
      sd.schedule_date::text AS "appointmentDate",
      a.queue_number AS "queueNumber"
    FROM appointments a
    JOIN schedule_days sd ON sd.id = a.schedule_day_id
    ORDER BY
      sd.schedule_date,
      CASE a.service_type WHEN 'physical' THEN 0 ELSE 1 END,
      a.queue_number,
      a.id
  `);

  return result.rows;
}

async function ensureDoctorExists(client: PoolClient, doctorId: number) {
  const result = await client.query<{ id: number }>(
    "SELECT id FROM doctors WHERE id = $1 LIMIT 1",
    [doctorId],
  );

  if (!result.rows[0]) {
    throw new Error(`Doctor ${doctorId} does not exist.`);
  }
}

async function insertAppointmentDrafts(
  client: PoolClient,
  drafts: AppointmentDraft[],
) {
  for (const draft of drafts) {
    await client.query(
      `
        INSERT INTO appointments (
          student_number,
          schedule_day_id,
          service_type,
          queue_number
        )
        VALUES ($1, $2, $3, $4)
      `,
      [
        draft.studentNumber,
        draft.scheduleDayId,
        draft.serviceType,
        draft.queueNumber,
      ],
    );
  }
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

async function ensurePhysicalScheduleDayWithDoctorCapacity(
  client: PoolClient,
  scheduleDate: string,
  fallbackCapacity = DEFAULT_SERVICE_CAPACITY.physical,
): Promise<ScheduleDay> {
  const capacity = await getEffectivePhysicalCapacity(
    client,
    scheduleDate,
    fallbackCapacity,
  );

  return ensureScheduleDayWithCapacity(
    client,
    "physical",
    scheduleDate,
    capacity,
  );
}

async function ensureScheduleDayWithCapacity(
  client: PoolClient,
  serviceType: ServiceType,
  scheduleDate: string,
  capacity: number,
): Promise<ScheduleDay> {
  const result = await client.query<ScheduleDay>(
    `
      INSERT INTO schedule_days (
        service_type,
        schedule_date,
        capacity,
        arrival_window
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (service_type, schedule_date)
      DO UPDATE SET capacity = EXCLUDED.capacity
      RETURNING
        id,
        service_type AS "serviceType",
        schedule_date::text AS "scheduleDate",
        capacity,
        arrival_window AS "arrivalWindow"
    `,
    [serviceType, scheduleDate, capacity, DEFAULT_ARRIVAL_WINDOW],
  );

  return result.rows[0];
}

async function getEffectivePhysicalCapacity(
  client: PoolClient,
  scheduleDate: string,
  fallbackCapacity: number,
) {
  const result = await client.query<{
    doctorCount: number;
    capacity: number;
  }>(
    `
      SELECT
        COUNT(d.id)::int AS "doctorCount",
        COALESCE(SUM(d.daily_physical_capacity) FILTER (
          WHERE du.id IS NULL
        ), 0)::int AS capacity
      FROM doctors d
      LEFT JOIN doctor_unavailabilities du
        ON du.doctor_id = d.id
        AND du.unavailable_date = $1
      WHERE d.is_available = true
    `,
    [scheduleDate],
  );
  const capacity = result.rows[0];

  if (!capacity || capacity.doctorCount === 0) {
    return fallbackCapacity;
  }

  return capacity.capacity;
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

    return left.studentNumber.localeCompare(right.studentNumber);
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

function compareRecomputableAppointments(
  left: RecomputableAppointment,
  right: RecomputableAppointment,
) {
  const dateDifference = left.appointmentDate.localeCompare(
    right.appointmentDate,
  );

  if (dateDifference !== 0) {
    return dateDifference;
  }

  const queueDifference = left.queueNumber - right.queueNumber;

  if (queueDifference !== 0) {
    return queueDifference;
  }

  return left.id - right.id;
}

function validateDoctorUnavailabilityInput({
  doctorId,
  unavailableDate,
}: RecordDoctorUnavailabilityInput) {
  if (!Number.isInteger(doctorId) || doctorId <= 0) {
    throw new Error("doctorId must be a positive integer.");
  }

  parseDateOnly(unavailableDate);
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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
  let weekdayHops = 0;

  for (const student of students) {
    while (
      currentScheduleDay.capacity <= 0 ||
      queueNumber > currentScheduleDay.capacity
    ) {
      currentDate = getNextWeekday(currentDate);
      currentScheduleDay = await resolveScheduleDay({
        serviceType,
        scheduleDate: currentDate,
        scheduleDaysByDate,
        getOrCreateScheduleDay,
      });
      queueNumber = 1;
      weekdayHops += 1;

      if (weekdayHops > MAX_RECOMPUTE_WEEKDAY_HOPS) {
        throw new Error(`No ${serviceType} capacity is available.`);
      }
    }

    drafts.push({
      studentNumber: student.studentNumber,
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
