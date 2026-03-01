import { getAddress } from "viem";

export const STRICT_ALLOWLISTS =
  (process.env.STRICT_ALLOWLISTS ?? "true").toLowerCase() === "true";

export function parseCsvAddrs(v?: string): Set<string> {
  const out = new Set<string>();
  if (!v) return out;
  for (const part of v.split(",").map((s) => s.trim()).filter(Boolean)) {
    try {
      out.add(getAddress(part));
    } catch {}
  }
  return out;
}

export function parsePairs(v?: string): Set<string> {
  const out = new Set<string>();
  if (!v) return out;
  for (const part of v.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [a, b] = part.split(">").map((s) => s.trim());
    if (!a || !b) continue;
    try {
      out.add(`${getAddress(a)}>${getAddress(b)}`);
    } catch {}
  }
  return out;
}

/**
 * Fail-closed guard when STRICT_ALLOWLISTS=true.
 * This lets /health run, but blocks endpoints that call this if env allowlists aren't set.
 */
export function assertAllowlistsConfigured(
  allowAdapters: Set<string>,
  allowTokens: Set<string>,
  allowPairs: Set<string>
) {
  if (!STRICT_ALLOWLISTS) return;

  const adaptersOk = allowAdapters.size > 0;
  const tokensOk = allowTokens.size > 0;
  const pairsOk = allowPairs.size > 0;

  if (!adaptersOk || !tokensOk || !pairsOk) {
    throw new Error(
      [
        "Relayer allowlists are not configured (STRICT_ALLOWLISTS=true).",
        `ALLOWED_ADAPTERS count=${allowAdapters.size}`,
        `ALLOWED_TOKENS count=${allowTokens.size}`,
        `ALLOWED_PAIRS count=${allowPairs.size}`,
        "Set env vars ALLOWED_ADAPTERS, ALLOWED_TOKENS, ALLOWED_PAIRS (or set STRICT_ALLOWLISTS=false for dev).",
      ].join(" ")
    );
  }
}

export function ensureAllowed(
  intent: { adapter: string; tokenIn: string; tokenOut: string },
  allowAdapters: Set<string>,
  allowTokens: Set<string>,
  allowPairs: Set<string>
) {
  const adapter = getAddress(intent.adapter);
  const tokenIn = getAddress(intent.tokenIn);
  const tokenOut = getAddress(intent.tokenOut);
  const pair = `${tokenIn}>${tokenOut}`;

  // In strict mode: empty allowlists are NOT allowed (caller should have called assertAllowlistsConfigured()).
  // In non-strict mode: empty allowlists mean "allow all" for that dimension (backwards compatible).
  if (allowAdapters.size && !allowAdapters.has(adapter)) {
    throw new Error(`adapter not allowed: ${adapter}`);
  }
  if (allowTokens.size && (!allowTokens.has(tokenIn) || !allowTokens.has(tokenOut))) {
    throw new Error(`token not allowed: ${tokenIn} or ${tokenOut}`);
  }
  if (allowPairs.size && !allowPairs.has(pair)) {
    throw new Error(`pair not allowed: ${pair}`);
  }
}
