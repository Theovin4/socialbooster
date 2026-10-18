import { describe, expect, it } from "vitest";
import { classifySubmissionError, safeSubmissionDiagnostics } from "./order-submission-outcome";
import { ProviderError } from "./providers/followspanel";

describe("provider submission outcomes", () => {
  it("treats explicit provider rejection as confirmed rejection", () => {
    expect(classifySubmissionError(new ProviderError("invalid", "UPSTREAM_REJECTED", false, "request-1"))).toBe("CONFIRMED_REJECTED");
    expect(classifySubmissionError(new ProviderError("HTTP 422", "HTTP", false, "request-2"))).toBe("CONFIRMED_REJECTED");
  });

  it("keeps timeouts, network failures and 5xx responses ambiguous", () => {
    expect(classifySubmissionError(new ProviderError("timeout", "NETWORK", true, "request-3"))).toBe("AMBIGUOUS");
    expect(classifySubmissionError(new ProviderError("HTTP 503", "HTTP", true, "request-4"))).toBe("AMBIGUOUS");
    expect(classifySubmissionError(new SyntaxError("invalid response"))).toBe("AMBIGUOUS");
  });

  it("stores only bounded safe diagnostics", () => {
    expect(safeSubmissionDiagnostics(new ProviderError("secret payload", "NETWORK", true, "safe-id"))).toEqual({
      providerErrorCode: "NETWORK",
      submissionRequestId: "safe-id",
      providerConfirmationReason: "NETWORK:delivery_uncertain",
    });
  });
});
