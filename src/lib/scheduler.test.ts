import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ARRIVAL_WINDOW,
  DEFAULT_SERVICE_CAPACITY,
  buildAppointmentDrafts,
} from "./scheduler";
import type {
  AppointmentDraft,
  ScheduleDay,
  ServiceType,
} from "./scheduler";

const students = [
  {
    id: 1,
    priorityStatus: "regular" as const,
  },
  {
    id: 2,
    priorityStatus: "ojt" as const,
  },
  {
    id: 3,
    priorityStatus: "graduating" as const,
  },
  {
    id: 4,
    priorityStatus: "tour" as const,
  },
];

test("buildAppointmentDrafts creates queue appointments in priority order", async () => {
  const days = [
    scheduleDay(10, "physical", "2026-06-01", 4),
    scheduleDay(20, "laboratory", "2026-06-01", 4),
  ];
  const { getOrCreateScheduleDay } = createScheduleDayStore(days);

  const drafts = await buildAppointmentDrafts({
    students,
    physicalScheduleDays: days.filter((day) => day.serviceType === "physical"),
    laboratoryScheduleDays: days.filter(
      (day) => day.serviceType === "laboratory",
    ),
    getOrCreateScheduleDay,
  });

  assert.deepEqual(
    drafts.map((draft) => ({
      studentId: draft.studentId,
      serviceType: draft.serviceType,
      scheduleDayId: draft.scheduleDayId,
      queueNumber: draft.queueNumber,
    })),
    [
      { studentId: 3, serviceType: "physical", scheduleDayId: 10, queueNumber: 1 },
      { studentId: 2, serviceType: "physical", scheduleDayId: 10, queueNumber: 2 },
      { studentId: 4, serviceType: "physical", scheduleDayId: 10, queueNumber: 3 },
      { studentId: 1, serviceType: "physical", scheduleDayId: 10, queueNumber: 4 },
      {
        studentId: 3,
        serviceType: "laboratory",
        scheduleDayId: 20,
        queueNumber: 1,
      },
      {
        studentId: 2,
        serviceType: "laboratory",
        scheduleDayId: 20,
        queueNumber: 2,
      },
      {
        studentId: 4,
        serviceType: "laboratory",
        scheduleDayId: 20,
        queueNumber: 3,
      },
      {
        studentId: 1,
        serviceType: "laboratory",
        scheduleDayId: 20,
        queueNumber: 4,
      },
    ],
  );
});

test("buildAppointmentDrafts overflows capacity onto the next weekday", async () => {
  const days = [
    scheduleDay(10, "physical", "2026-06-01", 2),
    scheduleDay(20, "laboratory", "2026-06-01", 4),
  ];
  const store = createScheduleDayStore(days);

  const drafts = await buildAppointmentDrafts({
    students,
    physicalScheduleDays: days.filter((day) => day.serviceType === "physical"),
    laboratoryScheduleDays: days.filter(
      (day) => day.serviceType === "laboratory",
    ),
    getOrCreateScheduleDay: store.getOrCreateScheduleDay,
  });

  const physicalDrafts = drafts.filter(
    (draft) => draft.serviceType === "physical",
  );

  assert.deepEqual(
    physicalDrafts.map((draft) => ({
      studentId: draft.studentId,
      date: store.dateForDraft(draft),
      queueNumber: draft.queueNumber,
    })),
    [
      { studentId: 3, date: "2026-06-01", queueNumber: 1 },
      { studentId: 2, date: "2026-06-01", queueNumber: 2 },
      { studentId: 4, date: "2026-06-02", queueNumber: 1 },
      { studentId: 1, date: "2026-06-02", queueNumber: 2 },
    ],
  );
});

test("buildAppointmentDrafts schedules physical and laboratory queues independently", async () => {
  const regularStudents = students.map((student) => ({
    ...student,
    priorityStatus: "regular" as const,
  }));
  const days = [
    scheduleDay(10, "physical", "2026-06-01", 2),
    scheduleDay(20, "laboratory", "2026-06-01", 3),
  ];
  const store = createScheduleDayStore(days);

  const drafts = await buildAppointmentDrafts({
    students: regularStudents,
    physicalScheduleDays: days.filter((day) => day.serviceType === "physical"),
    laboratoryScheduleDays: days.filter(
      (day) => day.serviceType === "laboratory",
    ),
    getOrCreateScheduleDay: store.getOrCreateScheduleDay,
  });

  assert.equal(
    store.dateForStudent(drafts, 3, "physical"),
    "2026-06-02",
  );
  assert.equal(
    store.dateForStudent(drafts, 3, "laboratory"),
    "2026-06-01",
  );
});

test("buildAppointmentDrafts skips weekends when creating overflow days", async () => {
  const days = [
    scheduleDay(10, "physical", "2026-06-05", 1),
    scheduleDay(20, "laboratory", "2026-06-05", 4),
  ];
  const store = createScheduleDayStore(days);

  const drafts = await buildAppointmentDrafts({
    students: students.slice(0, 2),
    physicalScheduleDays: days.filter((day) => day.serviceType === "physical"),
    laboratoryScheduleDays: days.filter(
      (day) => day.serviceType === "laboratory",
    ),
    getOrCreateScheduleDay: store.getOrCreateScheduleDay,
  });

  assert.equal(
    store.dateForStudent(drafts, 2, "physical"),
    "2026-06-05",
  );
  assert.equal(
    store.dateForStudent(drafts, 1, "physical"),
    "2026-06-08",
  );
});

test("buildAppointmentDrafts requires a configured weekday schedule day", async () => {
  const days = [scheduleDay(20, "laboratory", "2026-06-01", 4)];
  const { getOrCreateScheduleDay } = createScheduleDayStore(days);

  await assert.rejects(
    buildAppointmentDrafts({
      students,
      physicalScheduleDays: [],
      laboratoryScheduleDays: days,
      getOrCreateScheduleDay,
    }),
    /No weekday physical schedule days are configured/,
  );
});

function scheduleDay(
  id: number,
  serviceType: ServiceType,
  scheduleDate: string,
  capacity: number,
): ScheduleDay {
  return {
    id,
    serviceType,
    scheduleDate,
    capacity,
    arrivalWindow: DEFAULT_ARRIVAL_WINDOW,
  };
}

function createScheduleDayStore(initialDays: ScheduleDay[]) {
  let nextId = 100;
  const daysByKey = new Map(
    initialDays.map((day) => [scheduleDayKey(day.serviceType, day.scheduleDate), day]),
  );
  const daysById = new Map(initialDays.map((day) => [day.id, day]));

  function dateForDraft(draft: AppointmentDraft | undefined) {
    if (!draft) {
      return undefined;
    }

    return daysById.get(draft.scheduleDayId)?.scheduleDate;
  }

  return {
    getOrCreateScheduleDay(
      serviceType: ServiceType,
      scheduleDate: string,
    ): ScheduleDay {
      const key = scheduleDayKey(serviceType, scheduleDate);
      const existing = daysByKey.get(key);

      if (existing) {
        return existing;
      }

      const created = scheduleDay(
        nextId,
        serviceType,
        scheduleDate,
        DEFAULT_SERVICE_CAPACITY[serviceType],
      );
      nextId += 1;
      daysByKey.set(key, created);
      daysById.set(created.id, created);
      return created;
    },
    dateForDraft,
    dateForStudent(
      drafts: AppointmentDraft[],
      studentId: number,
      serviceType: ServiceType,
    ) {
      const draft = drafts.find(
        (candidate) =>
          candidate.studentId === studentId &&
          candidate.serviceType === serviceType,
      );

      return dateForDraft(draft);
    },
  };
}

function scheduleDayKey(serviceType: ServiceType, scheduleDate: string) {
  return `${serviceType}:${scheduleDate}`;
}
