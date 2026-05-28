import { SchedulerDashboard } from "@/components/SchedulerDashboard";
import { getErrorMessage } from "@/lib/error-message";
import { getAppointments } from "@/lib/scheduler";
import type { AppointmentRow } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

export default async function Home() {
  const initialData = await loadInitialData();

  return (
    <SchedulerDashboard
      initialAppointments={initialData.appointments}
      initialStatus={initialData.status}
    />
  );
}

async function loadInitialData(): Promise<{
  appointments: AppointmentRow[];
  status:
    | { kind: "idle"; message: string }
    | { kind: "error"; message: string };
}> {
  try {
    const appointments = await getAppointments();

    return {
      appointments,
      status: {
        kind: "idle",
        message: "Ready",
      },
    };
  } catch (error) {
    return {
      appointments: [],
      status: {
        kind: "error",
        message: getErrorMessage(error, "Unable to load appointments."),
      },
    };
  }
}
