import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("schema uses formatted student numbers as the students primary key", () => {
  const schema = readFileSync(join(root, "db", "schema.sql"), "utf8");
  const studentsTable = tableDefinition(schema, "students");

  assert.match(schema, /student_number TEXT PRIMARY KEY/);
  assert.match(
    schema,
    /CONSTRAINT students_student_number_format CHECK \(student_number ~ '\^\[0-9\]\{2\}-\[0-9\]\{4\}-\[0-9\]\{2\}\$'\)/,
  );
  assert.doesNotMatch(studentsTable, /id SERIAL PRIMARY KEY/);
});

test("appointments reference student numbers instead of numeric student ids", () => {
  const schema = readFileSync(join(root, "db", "schema.sql"), "utf8");
  const appointmentsTable = tableDefinition(schema, "appointments");

  assert.match(
    appointmentsTable,
    /student_number TEXT NOT NULL REFERENCES students\(student_number\) ON DELETE CASCADE/,
  );
  assert.match(
    appointmentsTable,
    /CONSTRAINT appointments_student_service_unique UNIQUE \(student_number, service_type\)/,
  );
  assert.doesNotMatch(appointmentsTable, /student_id INTEGER/);
  assert.doesNotMatch(appointmentsTable, /UNIQUE \(student_id, service_type\)/);
});

test("seed data uses formatted student numbers", () => {
  const seed = readFileSync(join(root, "db", "seed.sql"), "utf8");
  const studentNumbers = [...seed.matchAll(/'(\d{2}-\d{4}-\d{2})'/g)].map(
    ([, studentNumber]) => studentNumber,
  );

  assert.deepEqual(studentNumbers.slice(0, 6), [
    "23-1212-97",
    "23-1213-98",
    "23-1214-99",
    "23-1215-00",
    "23-1216-01",
    "23-1217-02",
  ]);
});

function tableDefinition(schema: string, tableName: string) {
  const match = schema.match(
    new RegExp(`CREATE TABLE ${tableName} \\([\\s\\S]*?\\);`),
  );

  assert.ok(match, `${tableName} table should exist`);
  return match[0];
}
