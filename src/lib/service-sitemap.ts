import { publicSiteUrl, urlSet } from "./sitemap-xml";

const PUBLIC_SERVICE_ID_PATTERN = /^SB-[A-F0-9]{16}$/;

export type ServiceSitemapCandidate = {
  id: string;
  updatedAt: string | null;
  active?: boolean;
  seoEligible: boolean;
};

export function serviceSitemapXml(services: readonly ServiceSitemapCandidate[]) {
  const entries = services
    .filter((service) =>
      service.active !== false &&
      service.seoEligible &&
      PUBLIC_SERVICE_ID_PATTERN.test(service.id),
    )
    .map((service) => ({
      url: `${publicSiteUrl}/services/${service.id}`,
      lastModified: service.updatedAt?.slice(0, 10),
    }));

  return urlSet(entries);
}
