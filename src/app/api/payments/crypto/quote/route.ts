import { FieldValue } from "firebase-admin/firestore";
import { currentUser } from "@/lib/firebase/session";
import { adminDb } from "@/lib/firebase/admin";
import { calculateCryptoQuote, CRYPTO_NETWORKS, cryptoQuoteSchema } from "@/lib/payments/crypto";
import { expireAwaitingCryptoDeposits } from "@/lib/payments/crypto-reconcile";

export async function POST(request: Request) {
  const user = await currentUser(true);
  if (!user) return Response.json({ error: "Sign in to request a payment quote" }, { status: 401 });
  await expireAwaitingCryptoDeposits();
  const input = cryptoQuoteSchema.parse(await request.json());
  const db = adminDb(), rateRef = db.collection("cryptoQuoteRateLimits").doc(user.uid), previous = await rateRef.get(), lastQuote = previous.get("createdAt")?.toMillis?.() || 0;
  if (Date.now() - lastQuote < 15_000) return Response.json({ error: "Please wait a few seconds before requesting another quote" }, { status: 429 });
  const { currentCryptoPrices } = await import("@/lib/payments/crypto");
  const prices = await currentCryptoPrices();
  const requestedNgnMinor = Math.round(input.amountNgn * 100);
  const quote = calculateCryptoQuote({ requestedNgnMinor, marketUsdNgn: prices.marketUsdNgn, btcUsd: prices.btcUsd, network: input.network });
  const ref = db.collection("cryptoDeposits").doc();
  const expiresAt = new Date(Date.now() + 18 * 60_000);
  const batch = db.batch();
  batch.create(ref, { userId: user.uid, network: input.network, asset: quote.asset, address: CRYPTO_NETWORKS[input.network].address, requestedNgnMinor, expectedAssetAmount: quote.expectedAssetAmount, marketUsdNgn: quote.marketUsdNgn, appliedUsdNgn: quote.appliedUsdNgn, rateBufferNgn: quote.bufferNgn, feeBps: quote.feeBps, status: "awaiting_payment", quoteExpiresAt: expiresAt, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  batch.set(rateRef, { createdAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return Response.json({ depositId: ref.id, network: input.network, label: CRYPTO_NETWORKS[input.network].label, asset: quote.asset, address: CRYPTO_NETWORKS[input.network].address, expectedAssetAmount: quote.expectedAssetAmount.toFixed(quote.asset === "BTC" ? 8 : 6), requestedNgnMinor, expiresAt: expiresAt.toISOString() });
}
