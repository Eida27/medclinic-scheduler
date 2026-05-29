const ARRIVAL_WINDOW_LABELS: Record<string, string> = {
  morning: "7:00 am - 11:00 am",
  afternoon: "1:00 pm - 4:00 pm",
};

export function formatArrivalWindow(arrivalWindow: string) {
  const trimmedWindow = arrivalWindow.trim();
  return ARRIVAL_WINDOW_LABELS[trimmedWindow.toLowerCase()] ?? trimmedWindow;
}
