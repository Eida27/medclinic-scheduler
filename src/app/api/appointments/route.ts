import { getAppointments } from "@/lib/scheduler";
import { getErrorMessage } from "@/lib/error-message";

export const runtime = "nodejs";

export async function GET() {
  try {
    const appointments = await getAppointments();
    return Response.json({ appointments });
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        error: getErrorMessage(error, "Failed to load appointments."),
      },
      { status: 500 },
    );
  }
}
