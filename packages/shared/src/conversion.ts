/**
 * NGN/XOF ↔ sats conversion + mempool.space fee context.
 *
 * Conversion always takes the BTC price as an explicit input, the
 * shared package never pretends to know a live price. Callers pass a
 * rate from config (demo placeholder) or a live source.
 */

export interface FeeContext {
  /** Fastest fee from mempool.space, sats/vB. */
  fastestFeeSatPerVbyte: number;
  /** Estimated on-chain fee for a typical 140 vB payment tx, in sats. */
  estimatedTxFeeSats: number;
  source: "mempool.space";
  note: string;
}

export function ngnToSats(amountNgn: number, btcPriceNgn: number): number {
  if (btcPriceNgn <= 0) throw new Error("BTC price must be positive");
  if (amountNgn < 0) throw new Error("Amount must not be negative");
  return Math.round((amountNgn / btcPriceNgn) * 100_000_000);
}

export function satsToNgn(amountSats: number, btcPriceNgn: number): number {
  if (btcPriceNgn <= 0) throw new Error("BTC price must be positive");
  if (amountSats < 0) throw new Error("Amount must not be negative");
  return Math.round((amountSats / 100_000_000) * btcPriceNgn);
}

export function xofToSats(amountXof: number, btcPriceXof: number): number {
  if (btcPriceXof <= 0) throw new Error("BTC price must be positive");
  if (amountXof < 0) throw new Error("Amount must not be negative");
  return Math.round((amountXof / btcPriceXof) * 100_000_000);
}

export function satsToXof(amountSats: number, btcPriceXof: number): number {
  if (btcPriceXof <= 0) throw new Error("BTC price must be positive");
  if (amountSats < 0) throw new Error("Amount must not be negative");
  return Math.round((amountSats / 100_000_000) * btcPriceXof);
}

/** Fee context for display only, Lighnib payments are Lightning, not on-chain. */
export function feeContext(fastestFeeSatPerVbyte: number): FeeContext {
  return {
    fastestFeeSatPerVbyte,
    estimatedTxFeeSats: fastestFeeSatPerVbyte * 140,
    source: "mempool.space",
    note: "Context only: Lighnib settles on Lightning; on-chain fees apply only to wallet funding.",
  };
}
