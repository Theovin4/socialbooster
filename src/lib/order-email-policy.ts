const problemStatuses = new Set(["failed", "cancelled", "partial", "provider_confirmation_required"]);

export function shouldSendOrderStatusEmail(status: string, routineEmailCount: number) {
  if (problemStatuses.has(status)) return true;
  return status === "completed" && routineEmailCount < 2;
}

export function orderStatusEmailCopy(status: string, orderId: string) {
  const readable = status.replaceAll("_", " ");
  if (status === "completed") return { subject: `Order #${orderId} completed`, title: "Your order is complete", message: `Order #${orderId} has completed. Sign in to verify the final delivery details.` };
  return { subject: `Action needed for order #${orderId}`, title: "An order requires your attention", message: `Order #${orderId} is now ${readable}. Open the order details for the latest verified status and available support options.` };
}
