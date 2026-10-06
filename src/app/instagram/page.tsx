import type { Metadata } from "next";
import { PlatformHubPage } from "@/components/platform-hub-page";
import { platformHubs } from "@/lib/platform-hubs";
export const metadata: Metadata = { title: "Instagram Services in Nigeria", description: "Compare current Instagram service categories, prices, order limits and practical guidance for Nigeria and Africa.", alternates: { canonical: "/instagram" }, openGraph: { title: "Instagram Services in Nigeria", description: "Compare current Instagram service options and ordering information.", url: "/instagram" } };
export default function Page() { return <PlatformHubPage hub={platformHubs.instagram} />; }
