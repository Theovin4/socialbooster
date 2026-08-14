import { afterEach, describe, expect, it, vi } from "vitest";
import { FollowsPanelClient, ProviderError } from "./followspanel";

afterEach(() => vi.unstubAllGlobals());

describe("FollowsPanelClient", () => {
  it("validates and normalizes the service catalog", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([{ service: "12", name: "Video views", type: "Default", rate: "1.25", min: "10", max: "1000", category: "Video", refill: 1, cancel: 0 }]), { status: 200 })));
    const services = await new FollowsPanelClient("https://provider.test", "secret").services();
    expect(services[0]).toMatchObject({ service: 12, refill: true, cancel: false });
  });

  it("does not retry an order submission", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("connection lost"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(new FollowsPanelClient("https://provider.test", "secret").add(12, "https://example.com/item", 100)).rejects.toBeInstanceOf(ProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed upstream data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([{ service: 1, name: "Bad", type: "Default", rate: "free", min: 10, max: 1, category: "Video", refill: false, cancel: false }]), { status: 200 })));
    await expect(new FollowsPanelClient("https://provider.test", "secret").services()).rejects.toThrow();
  });
});
