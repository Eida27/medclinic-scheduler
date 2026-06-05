import { SchedulerDashboard } from "@/components/SchedulerDashboard";
import { getErrorMessage } from "@/lib/error-message";
import { getAppointments, getDoctors } from "@/lib/scheduler";
import type { AppointmentRow, DoctorRow } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

export default async function Home() {
  const initialData = await loadInitialData();

  return (
    <SchedulerDashboard
      initialAppointments={initialData.appointments}
      initialDoctors={initialData.doctors}
      initialStatus={initialData.status}
    />
  );
}

async function loadInitialData(): Promise<{
  appointments: AppointmentRow[];
  doctors: DoctorRow[];
  status:
    | { kind: "idle"; message: string }
    | { kind: "error"; message: string };
}> {
  try {
    const [appointments, doctors] = await Promise.all([
      getAppointments(),
      getDoctors(),
    ]);

    return {
      appointments,
      doctors,
      status: {
        kind: "idle",
        message: "Ready",
      },
    };
  } catch (error) {
    return {
      appointments: [],
      doctors: [],
      status: {
        kind: "error",
        message: getErrorMessage(error, "Unable to load appointments."),
      },
    };
  }
}
