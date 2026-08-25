import { createHash } from "node:crypto";
import { z } from "zod";

export const cryptoNetworks = ["usdt_trc20", "usdt_bep20", "usdt_solana", "btc"] as const;
export type CryptoNetwork = (typeof cryptoNetworks)[number];

export const CRYPTO_NETWORKS: Record<CryptoNetwork, { label: string; asset: "USDT" | "BTC"; address: string; confirmations: number }> = {
  usdt_trc20: { label: "USDT (TRC20)", asset: "USDT", address: "TScypKhj7VmE9CrXAFn2EAKLcBG9qjwYoL", confirmations: 1 },
  usdt_bep20: { label: "USDT (BEP20)", asset: "USDT", address: "0xebc426c64ee3434d5e824e926b627039a21b48a1", confirmations: 12 },
  usdt_solana: { label: "USDT (Solana)", asset: "USDT", address: "3jgQ5Grn9awRoq1tux6zamrKaw91jQCgSRH6puE1Fokj", confirmations: 1 },
  btc: { label: "Bitcoin", asset: "BTC", address: "17Z41xvrwHRJtNNtFv1apomwHn6yAjKFnQ", confirmations: 2 },
};

export const cryptoQuoteSchema = z.object({ network: z.enum(cryptoNetworks), amountNgn: z.coerce.number().min(1_000).max(5_000_000) });
export const cryptoSubmissionSchema = z.object({ depositId: z.string().min(10).max(128), txHash: z.string().trim().min(32).max(128) });

export function calculateCryptoQuote(input: { requestedNgnMinor: number; marketUsdNgn: number; btcUsd: number; network: CryptoNetwork; bufferNgn?: number; feeBps?: number }) {
  const bufferNgn = input.bufferNgn ?? Number(process.env.CRYPTO_FX_BUFFER_NGN || 200);
  const feeBps = input.feeBps ?? Number(process.env.CRYPTO_FEE_BPS || 200);
  if (!Number.isSafeInteger(input.requestedNgnMinor) || input.requestedNgnMinor < 100_000) throw new Error("Minimum crypto deposit is NGN 1,000");
  if (!(input.marketUsdNgn > bufferNgn) || !(input.btcUsd > 0) || feeBps < 0 || feeBps > 2_000) throw new Error("A safe crypto quote is temporarily unavailable");
  const appliedUsdNgn = Math.floor(input.marketUsdNgn - bufferNgn);
  const usdBeforeFee = input.requestedNgnMinor / 100 / appliedUsdNgn;
  const assetAmount = input.network === "btc" ? usdBeforeFee / input.btcUsd : usdBeforeFee;
  const expectedAssetAmount = assetAmount * (1 + feeBps / 10_000);
  return { marketUsdNgn: input.marketUsdNgn, appliedUsdNgn, bufferNgn, feeBps, expectedAssetAmount, asset: CRYPTO_NETWORKS[input.network].asset };
}

export async function currentCryptoPrices() {
  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.COINGECKO_API_KEY) headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;
  const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=tether,bitcoin&vs_currencies=ngn,usd&include_last_updated_at=true", { headers, cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error("Live exchange rate is temporarily unavailable");
  const data = z.object({ tether: z.object({ ngn: z.number().positive(), last_updated_at: z.number().optional() }), bitcoin: z.object({ usd: z.number().positive(), last_updated_at: z.number().optional() }) }).parse(await response.json());
  const updatedAt = Math.min(data.tether.last_updated_at || 0, data.bitcoin.last_updated_at || 0);
  if (!updatedAt || Date.now() / 1000 - updatedAt > 600) throw new Error("Live exchange rate is stale; try again shortly");
  return { marketUsdNgn: data.tether.ngn, btcUsd: data.bitcoin.usd, updatedAt: new Date(updatedAt * 1000) };
}

type Verification = { valid: boolean; confirmed: boolean; amount: number; confirmations: number; reason?: string; blockTime?: Date };
const closeEnough = (actual: number, expected: number) => actual + Math.max(expected * 0.001, 0.00000001) >= expected;

async function verifyBitcoin(txHash: string, expected: number): Promise<Verification> {
  const base = process.env.BITCOIN_API_URL || "https://blockstream.info/api";
  const [txResponse, tipResponse] = await Promise.all([fetch(`${base}/tx/${txHash}`, { cache: "no-store", signal: AbortSignal.timeout(10_000) }), fetch(`${base}/blocks/tip/height`, { cache: "no-store", signal: AbortSignal.timeout(10_000) })]);
  if (!txResponse.ok) return { valid: false, confirmed: false, amount: 0, confirmations: 0, reason: "Bitcoin transaction was not found" };
  const tx = z.object({ vout: z.array(z.object({ scriptpubkey_address: z.string().optional(), value: z.number() })), status: z.object({ confirmed: z.boolean(), block_height: z.number().optional(), block_time: z.number().optional() }) }).parse(await txResponse.json());
  const amount = tx.vout.filter((output) => output.scriptpubkey_address === CRYPTO_NETWORKS.btc.address).reduce((sum, output) => sum + output.value, 0) / 1e8;
  const tip = tipResponse.ok ? Number(await tipResponse.text()) : 0;
  const confirmations = tx.status.confirmed && tx.status.block_height ? Math.max(1, tip - tx.status.block_height + 1) : 0;
  return { valid: closeEnough(amount, expected), confirmed: confirmations >= CRYPTO_NETWORKS.btc.confirmations, amount, confirmations, reason: amount ? undefined : "No payment to the configured Bitcoin address", blockTime: tx.status.block_time ? new Date(tx.status.block_time * 1000) : undefined };
}

async function bscRpc(method: string, params: unknown[]) {
  const response = await fetch(process.env.BSC_RPC_URL || "https://bsc-dataseed.bnbchain.org", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("BSC verification service is unavailable");
  return z.object({ result: z.unknown().nullable() }).parse(await response.json()).result;
}

async function verifyBsc(txHash: string, expected: number): Promise<Verification> {
  const receipt = await bscRpc("eth_getTransactionReceipt", [txHash]) as { status?: string; blockNumber?: string; logs?: Array<{ address?: string; topics?: string[]; data?: string }> } | null;
  if (!receipt) return { valid: false, confirmed: false, amount: 0, confirmations: 0, reason: "BSC transaction was not found" };
  if (receipt.status !== "0x1") return { valid: false, confirmed: false, amount: 0, confirmations: 0, reason: "BSC transaction failed" };
  const contract = "0x55d398326f99059ff775485246999027b3197955";
  const recipient = CRYPTO_NETWORKS.usdt_bep20.address.toLowerCase().slice(2).padStart(64, "0");
  const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const amount = (receipt.logs || []).filter((log) => log.address?.toLowerCase() === contract && log.topics?.[0]?.toLowerCase() === transferTopic && log.topics?.[2]?.toLowerCase().slice(2) === recipient).reduce((sum, log) => sum + Number(BigInt(log.data || "0x0")) / 1e18, 0);
  const latestHex = await bscRpc("eth_blockNumber", []) as string;
  const confirmations = receipt.blockNumber ? Number(BigInt(latestHex) - BigInt(receipt.blockNumber) + 1n) : 0;
  return { valid: closeEnough(amount, expected), confirmed: confirmations >= CRYPTO_NETWORKS.usdt_bep20.confirmations, amount, confirmations, reason: amount ? undefined : "No USDT transfer to the configured BEP20 address" };
}

async function verifySolana(txHash: string, expected: number): Promise<Verification> {
  const response = await fetch(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [txHash, { commitment: "finalized", encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }] }), cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("Solana verification service is unavailable");
  const result = (await response.json() as { result?: { blockTime?: number; meta?: { err?: unknown; preTokenBalances?: Array<{ owner?: string; mint?: string; uiTokenAmount?: { uiAmountString?: string } }>; postTokenBalances?: Array<{ owner?: string; mint?: string; uiTokenAmount?: { uiAmountString?: string } }> } } }).result;
  if (!result) return { valid: false, confirmed: false, amount: 0, confirmations: 0, reason: "Solana transaction was not found or is not finalized" };
  if (result.meta?.err) return { valid: false, confirmed: false, amount: 0, confirmations: 0, reason: "Solana transaction failed" };
  const mint = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
  const owner = CRYPTO_NETWORKS.usdt_solana.address;
  const total = (rows?: Array<{ owner?: string; mint?: string; uiTokenAmount?: { uiAmountString?: string } }>) => (rows || []).filter((row) => row.owner === owner && row.mint === mint).reduce((sum, row) => sum + Number(row.uiTokenAmount?.uiAmountString || 0), 0);
  const amount = total(result.meta?.postTokenBalances) - total(result.meta?.preTokenBalances);
  return { valid: closeEnough(amount, expected), confirmed: true, amount, confirmations: 1, reason: amount > 0 ? undefined : "No USDT transfer owned by the configured Solana address", blockTime: result.blockTime ? new Date(result.blockTime * 1000) : undefined };
}

const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function tronHex(address: string) {
  let value = 0n;
  for (const char of address) { const index = alphabet.indexOf(char); if (index < 0) throw new Error("Invalid TRON address"); value = value * 58n + BigInt(index); }
  const bytes = Buffer.from(value.toString(16).padStart(50, "0"), "hex");
  const payload = bytes.subarray(0, 21), checksum = createHash("sha256").update(createHash("sha256").update(payload).digest()).digest().subarray(0, 4);
  if (!checksum.equals(bytes.subarray(21))) throw new Error("Invalid TRON address checksum");
  return payload.toString("hex").toLowerCase();
}

async function verifyTron(txHash: string, expected: number): Promise<Verification> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.TRONGRID_API_KEY) headers["TRON-PRO-API-KEY"] = process.env.TRONGRID_API_KEY;
  const response = await fetch(`https://api.trongrid.io/v1/transactions/${txHash}/events?only_confirmed=true`, { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("TRON verification service is unavailable");
  const data = z.object({ data: z.array(z.object({ event_name: z.string(), contract_address: z.string(), result: z.record(z.string(), z.unknown()), block_timestamp: z.number().optional() })) }).parse(await response.json());
  const destination = tronHex(CRYPTO_NETWORKS.usdt_trc20.address).replace(/^41/, "");
  const events = data.data.filter((event) => event.event_name === "Transfer" && event.contract_address === "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
  const amount = events.filter((event) => String(event.result.to || event.result._to || "").toLowerCase().replace(/^0x/, "").replace(/^41/, "") === destination).reduce((sum, event) => sum + Number(event.result.value || event.result._value || 0) / 1e6, 0);
  return { valid: closeEnough(amount, expected), confirmed: events.length > 0, amount, confirmations: events.length ? 1 : 0, reason: amount ? undefined : "No confirmed USDT transfer to the configured TRC20 address", blockTime: events[0]?.block_timestamp ? new Date(events[0].block_timestamp) : undefined };
}

export async function verifyCryptoPayment(network: CryptoNetwork, txHash: string, expectedAmount: number): Promise<Verification> {
  if (network === "btc") return verifyBitcoin(txHash, expectedAmount);
  if (network === "usdt_bep20") return verifyBsc(txHash, expectedAmount);
  if (network === "usdt_solana") return verifySolana(txHash, expectedAmount);
  return verifyTron(txHash, expectedAmount);
}
