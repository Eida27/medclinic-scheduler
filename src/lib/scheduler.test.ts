import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ARRIVAL_WINDOW,
  DEFAULT_SERVICE_CAPACITY,
  buildPhysicalUnavailabilityRecomputePlan,
  buildAppointmentDrafts,
} from "./scheduler";
import type {
  AppointmentDraft,
  PriorityStatus,
  RecomputableAppointment,
  ScheduleDay,
  ServiceType,
  SchedulableStudent,
} from "./scheduler";

const students = [
  student("23-1212-97", "regular"),
  student("23-1213-98", "ojt"),
  student("23-1214-99", "graduating"),
  student("23-1215-00", "tour"),
];

test("buildAppointmentDrafts creates queue appointments in default priority order", async () => {
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
      studentNumber: draft.studentNumber,
      serviceType: draft.serviceType,
      scheduleDayId: draft.scheduleDayId,
      queueNumber: draft.queueNumber,
    })),
    [
      {
        studentNumber: "23-1215-00",
        serviceType: "physical",
        scheduleDayId: 10,
        queueNumber: 1,
      },
      {
        studentNumber: "23-1213-98",
        serviceType: "physical",
        scheduleDayId: 10,
        queueNumber: 2,
      },
      {
        studentNumber: "23-1214-99",
        serviceType: "physical",
        scheduleDayId: 10,
        queueNumber: 3,
      },
      {
        studentNumber: "23-1212-97",
        serviceType: "physical",
        scheduleDayId: 10,
        queueNumber: 4,
      },
      {
        studentNumber: "23-1215-00",
        serviceType: "laboratory",
        scheduleDayId: 20,
        queueNumber: 1,
      },
      {
        studentNumber: "23-1213-98",
        serviceType: "laboratory",
        scheduleDayId: 20,
        queueNumber: 2,
      },
      {
        studentNumber: "23-1214-99",
        serviceType: "laboratory",
        scheduleDayId: 20,
        queueNumber: 3,
      },
      {
        studentNumber: "23-1212-97",
        serviceType: "laboratory",
        scheduleDayId: 20,
        queueNumber: 4,
      },
    ],
  );
});

test("buildAppointmentDrafts promotes urgent lower-category deadlines over nonurgent higher categories", async () => {
  const deadlineStudents = [
    student("23-1212-97", "ojt", "2026-07-01"),
    student("23-1213-98", "graduating", "2026-06-02"),
    student("23-1214-99", "tour", "2026-07-15"),
    student("23-1215-00", "regular", null),
  ];
  const days = [
    scheduleDay(10, "physical", "2026-06-01", 4),
    scheduleDay(20, "laboratory", "2026-06-01", 4),
  ];
  const { getOrCreateScheduleDay } = createScheduleDayStore(days);

  const drafts = await buildAppointmentDrafts({
    students: deadlineStudents,
    physicalScheduleDays: days.filter((day) => day.serviceType === "physical"),
    laboratoryScheduleDays: days.filter(
      (day) => day.serviceType === "laboratory",
    ),
    getOrCreateScheduleDay,
  });

  assert.deepEqual(
    drafts
      .filter((draft) => draft.serviceType === "physical")
      .map((draft) => draft.studentNumber),
    ["23-1213-98", "23-1214-99", "23-1212-97", "23-1215-00"],
  );
});

test("buildAppointmentDrafts sorts urgent students by deadline before category", async () => {
  const deadlineStudents = [
    student("23-1212-97", "tour", "2026-06-07"),
    student("23-1213-98", "ojt", "2026-06-03"),
    student("23-1214-99", "graduating", "2026-06-02"),
    student("23-1215-00", "regular", "2026-06-01"),
  ];
  const days = [
    scheduleDay(10, "physical", "2026-06-01", 4),
    scheduleDay(20, "laboratory", "2026-06-01", 4),
  ];
  const { getOrCreateScheduleDay } = createScheduleDayStore(days);

  const drafts = await buildAppointmentDrafts({
    students: deadlineStudents,
    physicalScheduleDays: days.filter((day) => day.serviceType === "physical"),
    laboratoryScheduleDays: days.filter(
      (day) => day.serviceType === "laboratory",
    ),
    getOrCreateScheduleDay,
  });

  assert.deepEqual(
    drafts
      .filter((draft) => draft.serviceType === "physical")
      .map((draft) => draft.studentNumber),
    ["23-1215-00", "23-1214-99", "23-1213-98", "23-1212-97"],
  );
});

test("buildAppointmentDrafts sorts nonurgent students by category then deadline with nulls last", async () => {
  const deadlineStudents = [
    student("23-1212-97", "regular", null),
    student("23-1213-98", "regular", "2026-07-01"),
    student("23-1214-99", "tour", null),
    student("23-1215-00", "tour", "2026-07-10"),
  ];
  const days = [
    scheduleDay(10, "physical", "2026-06-01", 4),
    scheduleDay(20, "laboratory", "2026-06-01", 4),
  ];
  const { getOrCreateScheduleDay } = createScheduleDayStore(days);

  const drafts = await buildAppointmentDrafts({
    students: deadlineStudents,
    physicalScheduleDays: days.filter((day) => day.serviceType === "physical"),
    laboratoryScheduleDays: days.filter(
      (day) => day.serviceType === "laboratory",
    ),
    getOrCreateScheduleDay,
  });

  assert.deepEqual(
    drafts
      .filter((draft) => draft.serviceType === "physical")
      .map((draft) => draft.studentNumber),
    ["23-1215-00", "23-1214-99", "23-1213-98", "23-1212-97"],
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
      studentNumber: draft.studentNumber,
      date: store.dateForDraft(draft),
      queueNumber: draft.queueNumber,
    })),
    [
      {
        studentNumber: "23-1215-00",
        date: "2026-06-01",
        queueNumber: 1,
      },
      {
        studentNumber: "23-1213-98",
        date: "2026-06-01",
        queueNumber: 2,
      },
      {
        studentNumber: "23-1214-99",
        date: "2026-06-02",
        queueNumber: 1,
      },
      {
        studentNumber: "23-1212-97",
        date: "2026-06-02",
        queueNumber: 2,
      },
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
    store.dateForStudent(drafts, "23-1214-99", "physical"),
    "2026-06-02",
  );
  assert.equal(
    store.dateForStudent(drafts, "23-1214-99", "laboratory"),
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
    store.dateForStudent(drafts, "23-1213-98", "physical"),
    "2026-06-05",
  );
  assert.equal(
    store.dateForStudent(drafts, "23-1212-97", "physical"),
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

test("buildPhysicalUnavailabilityRecomputePlan shifts only overflow when capacity drops", async () => {
  const days = [
    scheduleDay(10, "physical", "2026-06-01", 2),
    scheduleDay(11, "physical", "2026-06-02", 4),
  ];
  const store = createScheduleDayStore(days);

  const result = await buildPhysicalUnavailabilityRecomputePlan({
    appointments: [
      recomputableAppointment(
        1,
        "23-1212-97",
        "physical",
        10,
        "2026-06-01",
        1,
      ),
      recomputableAppointment(
        2,
        "23-1213-98",
        "physical",
        10,
        "2026-06-01",
        2,
      ),
      recomputableAppointment(
        3,
        "23-1214-99",
        "physical",
        10,
        "2026-06-01",
        3,
      ),
      recomputableAppointment(
        4,
        "23-1215-00",
        "physical",
        10,
        "2026-06-01",
        4,
      ),
    ],
    firstAffectedDate: "2026-06-01",
    scheduleDays: days,
    getOrCreateScheduleDay: store.getOrCreateScheduleDay,
  });

  assert.deepEqual(
    result.drafts.map((draft) => ({
      appointmentId: draft.appointmentId,
      date: store.dateForDraft(draft),
      queueNumber: draft.queueNumber,
    })),
    [
      { appointmentId: 1, date: "2026-06-01", queueNumber: 1 },
      { appointmentId: 2, date: "2026-06-01", queueNumber: 2 },
      { appointmentId: 3, date: "2026-06-02", queueNumber: 1 },
      { appointmentId: 4, date: "2026-06-02", queueNumber: 2 },
    ],
  );
  assert.equal(result.movedAppointments, 2);
  assert.deepEqual(result.affectedDates, ["2026-06-01", "2026-06-02"]);
  assert.deepEqual(result.untouchedAppointmentIds, []);
});

test("buildPhysicalUnavailabilityRecomputePlan excludes earlier physical and laboratory appointments", async () => {
  const days = [
    scheduleDay(10, "physical", "2026-06-01", 1),
    scheduleDay(11, "physical", "2026-06-02", 2),
  ];
  const store = createScheduleDayStore(days);

  const result = await buildPhysicalUnavailabilityRecomputePlan({
    appointments: [
      recomputableAppointment(
        1,
        "23-1212-97",
        "physical",
        9,
        "2026-05-29",
        1,
      ),
      recomputableAppointment(
        2,
        "23-1213-98",
        "laboratory",
        20,
        "2026-06-01",
        1,
      ),
      recomputableAppointment(
        3,
        "23-1214-99",
        "physical",
        10,
        "2026-06-01",
        1,
      ),
      recomputableAppointment(
        4,
        "23-1215-00",
        "physical",
        10,
        "2026-06-01",
        2,
      ),
    ],
    firstAffectedDate: "2026-06-01",
    scheduleDays: days,
    getOrCreateScheduleDay: store.getOrCreateScheduleDay,
  });

  assert.deepEqual(result.untouchedAppointmentIds, [1, 2]);
  assert.deepEqual(
    result.drafts.map((draft) => ({
      appointmentId: draft.appointmentId,
      serviceType: draft.serviceType,
      date: store.dateForDraft(draft),
      queueNumber: draft.queueNumber,
    })),
    [
      {
        appointmentId: 3,
        serviceType: "physical",
        date: "2026-06-01",
        queueNumber: 1,
      },
      {
        appointmentId: 4,
        serviceType: "physical",
        date: "2026-06-02",
        queueNumber: 1,
      },
    ],
  );
  assert.equal(result.movedAppointments, 1);
});

function student(
  studentNumber: string,
  priorityStatus: PriorityStatus,
  deadlineDate: string | null = null,
): SchedulableStudent {
  return {
    studentNumber,
    priorityStatus,
    deadlineDate,
  };
}

function recomputableAppointment(
  id: number,
  studentNumber: string,
  serviceType: ServiceType,
  scheduleDayId: number,
  appointmentDate: string,
  queueNumber: number,
): RecomputableAppointment {
  return {
    id,
    studentNumber,
    serviceType,
    scheduleDayId,
    appointmentDate,
    queueNumber,
  };
}

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
      studentNumber: string,
      serviceType: ServiceType,
    ) {
      const draft = drafts.find(
        (candidate) =>
          candidate.studentNumber === studentNumber &&
          candidate.serviceType === serviceType,
      );

      return dateForDraft(draft);
    },
  };
}

function scheduleDayKey(serviceType: ServiceType, scheduleDate: string) {
  return `${serviceType}:${scheduleDate}`;
}
