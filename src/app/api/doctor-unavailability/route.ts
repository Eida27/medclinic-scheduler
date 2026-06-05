import {
  recordDoctorUnavailabilityAndRecompute,
  type RecordDoctorUnavailabilityInput,
} from "@/lib/scheduler";
import { getErrorMessage } from "@/lib/error-message";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<RecordDoctorUnavailabilityInput>;
    const result = await recordDoctorUnavailabilityAndRecompute({
      doctorId: Number(body.doctorId),
      unavailableDate: String(body.unavailableDate ?? ""),
      reason: body.reason,
    });

    return Response.json(result);
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        error: getErrorMessage(
          error,
          "Failed to record doctor unavailability.",
        ),
      },
      { status: 500 },
    );
  }
}
