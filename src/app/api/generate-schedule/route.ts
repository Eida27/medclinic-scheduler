import { generateSchedule } from "@/lib/scheduler";
import { getErrorMessage } from "@/lib/error-message";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await generateSchedule();
    return Response.json(result);
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        error: getErrorMessage(error, "Failed to generate the schedule."),
      },
      { status: 500 },
    );
  }
}
