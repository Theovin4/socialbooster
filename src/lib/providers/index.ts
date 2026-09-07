import { FollowsPanelClient } from "./followspanel";
import { StandardPanelClient } from "./standard-panel";

export const PROVIDER_KEYS = ["followspanel", "nitro", "smmworld"] as const;
export type ProviderKey = typeof PROVIDER_KEYS[number];
export type ProviderClient = Pick<FollowsPanelClient, "services" | "balance" | "add" | "status" | "statuses" | "refill" | "refillStatus" | "refillStatuses" | "cancel">;
export type ProviderDefinition = { key: ProviderKey; label: string; currency: "NGN" | "USD"; configured: boolean; client: ProviderClient };

export function isProviderKey(value: unknown): value is ProviderKey {
  return typeof value === "string" && PROVIDER_KEYS.includes(value as ProviderKey);
}

export function normalizeProviderKey(value: unknown): ProviderKey {
  return value === "nitro" || value === "smmworld" ? value : "followspanel";
}

export function providerServiceDocumentId(provider: ProviderKey, serviceId: number) {
  return provider === "followspanel" ? String(serviceId) : `${provider}_${serviceId}`;
}

export function providerDefinitions(): ProviderDefinition[] {
  const followspanelUrl = process.env.FOLLOWSPANEL_API_URL?.trim() || "https://followspanel.com/api/v2";
  const nitroUrl = process.env.NITRO_API_URL?.trim() || "https://nitro.ng/api/v2";
  const smmworldUrl = process.env.SMMWORLD_API_URL?.trim() || "https://my.smmworld.org/api/v2";

  return [
    { key: "followspanel", label: "Followpanel", currency: "NGN", configured: Boolean(process.env.FOLLOWSPANEL_API_KEY?.trim()), client: new FollowsPanelClient(followspanelUrl) },
    { key: "nitro", label: "Nitro NG", currency: "NGN", configured: Boolean(process.env.NITRO_API_KEY?.trim()), client: new StandardPanelClient(nitroUrl, process.env.NITRO_API_KEY, "form") },
    { key: "smmworld", label: "SMM World", currency: "USD", configured: Boolean(process.env.SMMWORLD_API_KEY?.trim()), client: new StandardPanelClient(smmworldUrl, process.env.SMMWORLD_API_KEY, "json") },
  ];
}

export function getProvider(provider: unknown) {
  const key = normalizeProviderKey(provider);
  return providerDefinitions().find((item) => item.key === key)!;
}
