import type { Metadata } from "next";
import { PlatformHubPage } from "@/components/platform-hub-page";
import { platformHubs } from "@/lib/platform-hubs";
export const metadata: Metadata = { title: "YouTube Services in Nigeria", description: "Compare current YouTube channel and video services, prices, limits and ordering guidance.", alternates: { canonical: "/youtube" }, openGraph: { title: "YouTube Services in Nigeria", description: "Compare YouTube service options and ordering information.", url: "/youtube" } };
export default function Page() { return <PlatformHubPage hub={platformHubs.youtube} />; }
