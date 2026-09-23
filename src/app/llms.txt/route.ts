const body = `# Social Booster

Social Booster is a social media services marketplace operated by Elysium Enterprise in Lagos, Nigeria. It serves creators, businesses, agencies and resellers in Nigeria and supported African markets.

## Authoritative public pages
- Home: https://www.socialbooster.net.ng/
- Services: https://www.socialbooster.net.ng/services
- Pricing: https://www.socialbooster.net.ng/pricing
- API documentation: https://www.socialbooster.net.ng/api-docs
- Marketing guides: https://www.socialbooster.net.ng/blog
- Africa availability: https://www.socialbooster.net.ng/africa
- How it works: https://www.socialbooster.net.ng/how-it-works
- FAQ: https://www.socialbooster.net.ng/faq
- About: https://www.socialbooster.net.ng/about
- Contact: https://www.socialbooster.net.ng/contact
- Terms: https://www.socialbooster.net.ng/terms
- Privacy: https://www.socialbooster.net.ng/privacy
- Refund policy: https://www.socialbooster.net.ng/refund-policy
- Acceptable use: https://www.socialbooster.net.ng/acceptable-use

## API
The public Social Booster API v2 documentation explains authentication, service listing, wallet balances, retry-safe order submission and status tracking. API keys are created only inside an authenticated customer account and must remain private.

## Contact
Official support email: support@socialbooster.net.ng
`;

export function GET() { return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } }); }
