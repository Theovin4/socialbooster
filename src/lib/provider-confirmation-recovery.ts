export const PROVIDER_CONFIRMATION_REQUIRED = "provider_confirmation_required";

export type ProviderConfirmationDecision = "accepted" | "rejected" | "retry";

export type ProviderConfirmationOrder = {
  status?: unknown;
  providerAccepted?: unknown;
  providerOrderId?: unknown;
  providerConfirmationDecision?: unknown;
  providerConfirmationExternalId?: unknown;
};

export function providerConfirmationRecoveryState(order: ProviderConfirmationOrder) {
  if (String(order.status || "") !== PROVIDER_CONFIRMATION_REQUIRED) {
    return { eligible: false as const, reason: "Order is not awaiting provider confirmation" };
  }
  if (order.providerAccepted === true || Number.isSafeInteger(order.providerOrderId)) {
    return { eligible: false as const, reason: "Order already has a provider confirmation" };
  }
  return { eligible: true as const };
}

export function providerConfirmationClaimMatches(
  order: ProviderConfirmationOrder,
  decision: ProviderConfirmationDecision,
  providerOrderId?: number,
) {
  if (order.providerConfirmationDecision !== decision) return false;
  if (decision === "rejected" || decision === "retry") return true;
  return Number(order.providerConfirmationExternalId) === providerOrderId;
}

export function providerOrderIndexId(providerKey: string, providerOrderId: number) {
  const key = providerKey.trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,40}$/.test(key)) throw new Error("Invalid provider key");
  if (!Number.isSafeInteger(providerOrderId) || providerOrderId <= 0) throw new Error("Invalid provider order ID");
  return `${key}:${providerOrderId}`;
}

export function providerConfirmationRefundKeys(orderId: string) {
  return [
    `refund:${orderId}`,
    `status-refund:${orderId}`,
    `admin-order-refund:${orderId}`,
    `provider-confirmation-refund:${orderId}`,
  ] as const;
}
