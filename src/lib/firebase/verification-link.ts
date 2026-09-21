export function brandedVerificationLink(firebaseLink: string, appUrl: string) {
  const code = new URL(firebaseLink).searchParams.get("oobCode");
  if (!code) return firebaseLink;
  const url = new URL("/verify-email", appUrl);
  url.searchParams.set("oobCode", code);
  return url.toString();
}
