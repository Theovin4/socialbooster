const labels: Record<string, string> = {
  provider_confirmation_required: "Under review",
  submitting: "Processing",
  in_progress: "In progress",
  cancel_requested: "Cancellation requested",
};

export function customerOrderStatusLabel(value: unknown) {
  const status = String(value || "pending").toLowerCase();
  return labels[status] || status.replaceAll("_", " ");
}
