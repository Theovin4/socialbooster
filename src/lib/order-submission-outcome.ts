import { ProviderError } from "./providers/followspanel";

export const submissionOutcomes = ["CONFIRMED_ACCEPTED", "CONFIRMED_REJECTED", "AMBIGUOUS"] as const;
export type SubmissionOutcome = (typeof submissionOutcomes)[number];

const rejectedCodes = new Set(["NOT_CONFIGURED", "UPSTREAM_REJECTED", "INVALID_SERVICE", "CIRCUIT_OPEN"]);

export function classifySubmissionError(error: unknown): Exclude<SubmissionOutcome, "CONFIRMED_ACCEPTED"> {
  if (!(error instanceof ProviderError)) return "AMBIGUOUS";
  if (rejectedCodes.has(error.code)) return "CONFIRMED_REJECTED";
  if (error.code === "HTTP" && !error.retryable) return "CONFIRMED_REJECTED";
  return "AMBIGUOUS";
}

export function safeSubmissionDiagnostics(error: unknown) {
  return {
    providerErrorCode: error instanceof ProviderError ? error.code : "UNKNOWN",
    submissionRequestId: error instanceof ProviderError ? error.requestId || null : null,
    providerConfirmationReason: error instanceof ProviderError
      ? `${error.code}:${error.retryable ? "delivery_uncertain" : "explicit_rejection"}`
      : "UNKNOWN:delivery_uncertain",
  };
}
