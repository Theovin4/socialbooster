import type { Metadata } from "next";
import { PlatformHubPage } from "@/components/platform-hub-page";
import { platformHubs } from "@/lib/platform-hubs";
export const metadata: Metadata = { title: "TikTok Services in Nigeria", description: "Compare current TikTok service categories, prices and order requirements for Nigeria and Africa.", alternates: { canonical: "/tiktok" }, openGraph: { title: "TikTok Services in Nigeria", description: "Compare current TikTok service options and ordering information.", url: "/tiktok" } };
export default function Page() { return <PlatformHubPage hub={platformHubs.tiktok} />; }
