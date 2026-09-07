import { afterEach, describe, expect, it, vi } from "vitest";
import { StandardPanelClient } from "./standard-panel";
import { normalizeProviderKey, providerServiceDocumentId } from "./index";

afterEach(() => vi.unstubAllGlobals());

describe("StandardPanelClient", () => {
  it("uses form encoding for Nitro NG", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ balance: "1000", currency: "NGN" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await new StandardPanelClient("https://nitro.test/api/v2", "secret", "form").balance();
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(request.headers).toMatchObject({ "content-type": "application/x-www-form-urlencoded" });
    expect(String(request.body)).toContain("action=balance");
    expect(String(request.body)).toContain("key=secret");
  });

  it("uses JSON encoding for SMM World", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ order: 123 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await new StandardPanelClient("https://smmworld.test/api/v2", "secret", "json").add(12, "https://example.com/post", 100);
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(request.headers).toMatchObject({ "content-type": "application/json" });
    expect(JSON.parse(String(request.body))).toEqual({ key: "secret", action: "add", service: "12", link: "https://example.com/post", quantity: "100" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps service IDs isolated by provider", () => {
    expect(providerServiceDocumentId("followspanel", 10)).toBe("10");
    expect(providerServiceDocumentId("nitro", 10)).toBe("nitro_10");
    expect(providerServiceDocumentId("smmworld", 10)).toBe("smmworld_10");
    expect(normalizeProviderKey(undefined)).toBe("followspanel");
  });
});
