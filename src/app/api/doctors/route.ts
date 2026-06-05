import { getDoctors } from "@/lib/scheduler";
import { getErrorMessage } from "@/lib/error-message";

export const runtime = "nodejs";

export async function GET() {
  try {
    const doctors = await getDoctors();
    return Response.json({ doctors });
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        error: getErrorMessage(error, "Failed to load doctors."),
      },
      { status: 500 },
    );
  }
}
