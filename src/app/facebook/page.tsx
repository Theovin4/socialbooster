import type { Metadata } from "next";
import { PlatformHubPage } from "@/components/platform-hub-page";
import { platformHubs } from "@/lib/platform-hubs";
export const metadata: Metadata = { title: "Facebook Services in Nigeria", description: "Compare Facebook page and content service categories, current prices and order requirements.", alternates: { canonical: "/facebook" }, openGraph: { title: "Facebook Services in Nigeria", description: "Compare Facebook service options and ordering information.", url: "/facebook" } };
export default function Page() { return <PlatformHubPage hub={platformHubs.facebook} />; }
