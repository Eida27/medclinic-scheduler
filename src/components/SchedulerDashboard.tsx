"use client";

import { useMemo, useState } from "react";

import { getErrorMessage } from "@/lib/error-message";
import type { AppointmentRow, GenerateScheduleResult } from "@/lib/scheduler";

type AppointmentResponse = {
  appointments: AppointmentRow[];
  error?: string;
};

type DashboardStatus =
  | { kind: "idle"; message: string }
  | { kind: "loading"; message: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export function SchedulerDashboard({
  initialAppointments,
  initialStatus,
}: {
  initialAppointments: AppointmentRow[];
  initialStatus: DashboardStatus;
}) {
  const [appointments, setAppointments] =
    useState<AppointmentRow[]>(initialAppointments);
  const [status, setStatus] = useState<DashboardStatus>({
    ...initialStatus,
  });

  const grouped = useMemo(
    () => ({
      physical: appointments.filter(
        (appointment) => appointment.serviceType === "physical",
      ),
      laboratory: appointments.filter(
        (appointment) => appointment.serviceType === "laboratory",
      ),
    }),
    [appointments],
  );

  async function loadAppointments() {
    const response = await fetch("/api/appointments", {
      cache: "no-store",
    });
    const data = (await response.json()) as AppointmentResponse;

    if (!response.ok) {
      throw new Error(data.error ?? "Unable to load appointments.");
    }

    setAppointments(data.appointments);
  }

  async function generateSchedule() {
    setStatus({ kind: "loading", message: "Generating" });

    try {
      const response = await fetch("/api/generate-schedule", {
        method: "POST",
      });
      const data = (await response.json()) as GenerateScheduleResult & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to generate schedule.");
      }

      await loadAppointments();
      setStatus({
        kind: "success",
        message: `${data.totalCreated} appointments generated`,
      });
    } catch (error) {
      setStatus({
        kind: "error",
        message: getErrorMessage(error, "Unable to generate schedule."),
      });
    }
  }

  return (
    <main className="dashboard-shell">
      <section className="toolbar" aria-label="Schedule actions">
        <div>
          <p className="eyebrow">CPU Medical Clinic</p>
          <h1>MedClinic Scheduler</h1>
        </div>
        <div className="toolbar-actions">
          <span className={`status-pill status-${status.kind}`}>
            {status.message}
          </span>
          <button
            className="primary-button"
            disabled={status.kind === "loading"}
            onClick={generateSchedule}
            type="button"
          >
            Generate Schedule
          </button>
        </div>
      </section>

      <section className="metrics-grid" aria-label="Generated appointment counts">
        <Metric label="Total" value={appointments.length} />
        <Metric label="Physical" value={grouped.physical.length} />
        <Metric label="Laboratory" value={grouped.laboratory.length} />
      </section>

      <section className="schedule-layout">
        <AppointmentTable title="Physical Examinations" rows={grouped.physical} />
        <AppointmentTable title="Laboratory Appointments" rows={grouped.laboratory} />
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-panel">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AppointmentTable({
  title,
  rows,
}: {
  title: string;
  rows: AppointmentRow[];
}) {
  return (
    <section className="table-panel">
      <div className="table-header">
        <h2>{title}</h2>
        <span>{rows.length}</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>College</th>
              <th>Priority</th>
              <th>Date</th>
              <th>Time</th>
              <th>Doctor</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="empty-cell" colSpan={6}>
                  No appointments generated
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.studentName}</strong>
                    <span>{row.studentNumber}</span>
                  </td>
                  <td>
                    {row.college}
                    <span>Year {row.yearLevel}</span>
                  </td>
                  <td>
                    <span className="priority-chip">
                      {formatPriority(row.priorityStatus)}
                    </span>
                  </td>
                  <td>{row.appointmentDate}</td>
                  <td>
                    {row.startTime} - {row.endTime}
                  </td>
                  <td>{row.doctorName ?? "Laboratory"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatPriority(priority: AppointmentRow["priorityStatus"]) {
  if (priority === "ojt") {
    return "OJT";
  }

  return priority.charAt(0).toUpperCase() + priority.slice(1);
}
