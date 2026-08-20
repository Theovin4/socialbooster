export async function POST() {
  return Response.json({ error: "PayPal funding is unavailable for NGN wallets. Use Flutterwave." }, { status: 503 });
}
