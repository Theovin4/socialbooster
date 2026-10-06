import type { Metadata } from "next";
import { PlatformHubPage } from "@/components/platform-hub-page";
import { platformHubs } from "@/lib/platform-hubs";
export const metadata: Metadata = { title: "Telegram Services in Nigeria", description: "Compare Telegram channel and post service categories with current prices and order guidance.", alternates: { canonical: "/telegram" }, openGraph: { title: "Telegram Services in Nigeria", description: "Compare Telegram service options and ordering information.", url: "/telegram" } };
export default function Page() { return <PlatformHubPage hub={platformHubs.telegram} />; }
