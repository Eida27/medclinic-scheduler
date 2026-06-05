"use client";

import Image from "next/image";
import { type FormEvent, useMemo, useState } from "react";

import { formatArrivalWindow } from "@/lib/arrival-window";
import { getErrorMessage } from "@/lib/error-message";
import type {
  AppointmentRow,
  DoctorRow,
  GenerateScheduleResult,
  RecordDoctorUnavailabilityResult,
} from "@/lib/scheduler";

type AppointmentResponse = {
  appointments: AppointmentRow[];
  error?: string;
};

type DoctorsResponse = {
  doctors: DoctorRow[];
  error?: string;
};

type DoctorUnavailabilityResponse = RecordDoctorUnavailabilityResult & {
  error?: string;
};

type DashboardStatus =
  | { kind: "idle"; message: string }
  | { kind: "loading"; message: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export function SchedulerDashboard({
  initialAppointments,
  initialDoctors,
  initialStatus,
}: {
  initialAppointments: AppointmentRow[];
  initialDoctors: DoctorRow[];
  initialStatus: DashboardStatus;
}) {
  const [appointments, setAppointments] =
    useState<AppointmentRow[]>(initialAppointments);
  const [doctors, setDoctors] = useState<DoctorRow[]>(initialDoctors);
  const [selectedDoctorId, setSelectedDoctorId] = useState(
    initialDoctors[0]?.id.toString() ?? "",
  );
  const [unavailableDate, setUnavailableDate] = useState("");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<DashboardStatus>({
    ...initialStatus,
  });
  const isBusy = status.kind === "loading";

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

  async function loadDoctors() {
    const response = await fetch("/api/doctors", {
      cache: "no-store",
    });
    const data = (await response.json()) as DoctorsResponse;

    if (!response.ok) {
      throw new Error(data.error ?? "Unable to load doctors.");
    }

    setDoctors(data.doctors);
    setSelectedDoctorId(
      (currentDoctorId) =>
        currentDoctorId || data.doctors[0]?.id.toString() || "",
    );
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

  async function recordDoctorUnavailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedDoctorId || !unavailableDate) {
      setStatus({
        kind: "error",
        message: "Select a doctor and date",
      });
      return;
    }

    setStatus({ kind: "loading", message: "Recomputing" });

    try {
      const response = await fetch("/api/doctor-unavailability", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          doctorId: Number(selectedDoctorId),
          unavailableDate,
          reason,
        }),
      });
      const data = (await response.json()) as DoctorUnavailabilityResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Unable to record unavailability.");
      }

      setAppointments(data.appointments);
      await loadDoctors();
      setReason("");
      setStatus({
        kind: "success",
        message: `${data.movedAppointments} appointments moved`,
      });
    } catch (error) {
      setStatus({
        kind: "error",
        message: getErrorMessage(error, "Unable to record unavailability."),
      });
    }
  }

  return (
    <main className="dashboard-shell">
      <section className="toolbar" aria-label="Schedule actions">
        <div className="brand-lockup">
          <Image
            alt="Central Philippine University seal"
            className="brand-mark"
            height={64}
            priority
            src="/cpu-seal.png"
            width={64}
          />
          <div>
            <p className="eyebrow">CPU Medical Clinic</p>
            <h1>MedClinic Scheduler</h1>
          </div>
        </div>
        <div className="toolbar-actions">
          <span
            aria-live="polite"
            className={`status-pill status-${status.kind}`}
          >
            {status.message}
          </span>
          <button
            className="primary-button"
            disabled={isBusy}
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

      <section
        className="doctor-unavailability-panel"
        aria-label="Doctor unavailability"
      >
        <div className="table-header">
          <h2>Doctor Unavailability</h2>
          <span>{doctors.length}</span>
        </div>
        <form
          className="doctor-unavailability-form"
          onSubmit={recordDoctorUnavailability}
        >
          <label className="form-field">
            <span>Doctor</span>
            <select
              disabled={isBusy || doctors.length === 0}
              name="doctorId"
              onChange={(event) => setSelectedDoctorId(event.target.value)}
              required
              value={selectedDoctorId}
            >
              <option disabled value="">
                Select doctor
              </option>
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.fullName} ({doctor.dailyPhysicalCapacity}/day)
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Date</span>
            <input
              disabled={isBusy || doctors.length === 0}
              name="unavailableDate"
              onChange={(event) => setUnavailableDate(event.target.value)}
              required
              type="date"
              value={unavailableDate}
            />
          </label>
          <label className="form-field reason-field">
            <span>Reason</span>
            <input
              disabled={isBusy || doctors.length === 0}
              name="reason"
              onChange={(event) => setReason(event.target.value)}
              placeholder="Optional"
              type="text"
              value={reason}
            />
          </label>
          <button
            className="secondary-button"
            disabled={isBusy || doctors.length === 0}
            type="submit"
          >
            Record Unavailability
          </button>
        </form>
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
      <span>{label} Appointments</span>
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
              <th>Deadline</th>
              <th>Date</th>
              <th>Queue Number</th>
              <th>Arrival Window</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="empty-cell" colSpan={7}>
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
                  <td data-label="College">
                    <div className="cell-stack">
                      <span className="cell-primary">{row.college}</span>
                      <span className="cell-secondary">Year {row.yearLevel}</span>
                    </div>
                  </td>
                  <td data-label="Priority">
                    <span className="priority-chip">
                      {formatPriority(row.priorityStatus)}
                    </span>
                  </td>
                  <td data-label="Deadline">{row.deadlineDate ?? "-"}</td>
                  <td data-label="Date">{row.appointmentDate}</td>
                  <td data-label="Queue Number">#{row.queueNumber}</td>
                  <td data-label="Arrival Window">
                    {formatArrivalWindow(row.arrivalWindow)}
                  </td>
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

  if (priority === "tour") {
    return "Tour-related";
  }

  return priority.charAt(0).toUpperCase() + priority.slice(1);
}
