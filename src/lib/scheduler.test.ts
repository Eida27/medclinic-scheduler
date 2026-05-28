import assert from "node:assert/strict";
import test from "node:test";

import { buildAppointmentDrafts } from "./scheduler";

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
];

const physicalSlots = [
  { id: 10, serviceType: "physical" as const, capacity: 1 },
  { id: 11, serviceType: "physical" as const, capacity: 1 },
  { id: 12, serviceType: "physical" as const, capacity: 1 },
];

const laboratorySlots = [
  { id: 20, serviceType: "laboratory" as const, capacity: 2 },
  { id: 21, serviceType: "laboratory" as const, capacity: 2 },
];

test("buildAppointmentDrafts creates one physical and one laboratory appointment per student", () => {
  const drafts = buildAppointmentDrafts({
    students,
    physicalSlots,
    laboratorySlots,
  });

  assert.equal(drafts.length, 6);
  assert.deepEqual(
    drafts.map((draft) => ({
      studentId: draft.studentId,
      serviceType: draft.serviceType,
    })),
    [
      { studentId: 3, serviceType: "physical" },
      { studentId: 3, serviceType: "laboratory" },
      { studentId: 2, serviceType: "physical" },
      { studentId: 2, serviceType: "laboratory" },
      { studentId: 1, serviceType: "physical" },
      { studentId: 1, serviceType: "laboratory" },
    ],
  );
  assert.deepEqual(
    drafts.map((draft) => draft.timeSlotId),
    [10, 20, 11, 20, 12, 21],
  );
});
