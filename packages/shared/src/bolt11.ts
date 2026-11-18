/**
 * Minimal BOLT11 decoder (bech32), enough to extract what INV-9 needs:
 * payment hash (tag `p`), amount (from the HRP), description (tag `d`,
 * which carries the Lighnib memo `Lighnib:order#ID:supplierId`).
 *
 * BOLT11 has NO payee field, that is why INV-9 exists: the app records
 * hash↔supplierId at invoice creation and checks it before any wallet
 * request. Never claim the wallet knows the supplier.
 */

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function bech32Polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((b >> i) & 1) chk ^= GEN[i];
    }
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (const c of hrp) out.push(c.charCodeAt(0) >> 5);
  out.push(0);
  for (const c of hrp) out.push(c.charCodeAt(0) & 31);
  return out;
}

/** Decode a bech32 string. Returns { hrp, data } (5-bit groups, checksum stripped) or null. */
export function bech32Decode(input: string): { hrp: string; data: number[] } | null {
  const s = input.toLowerCase();
  const sep = s.lastIndexOf("1");
  if (sep < 1 || sep + 7 > s.length) return null;
  const hrp = s.slice(0, sep);
  const data: number[] = [];
  for (const c of s.slice(sep + 1)) {
    const v = BECH32_CHARSET.indexOf(c);
    if (v === -1) return null;
    data.push(v);
  }
  if (bech32Polymod([...hrpExpand(hrp), ...data]) !== 1) return null;
  return { hrp, data: data.slice(0, -6) };
}

/** Convert 5-bit groups to 8-bit bytes (with optional padding check). */
export function convertBits(data: number[], from: number, to: number, pad: boolean): number[] | null {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  const maxv = (1 << to) - 1;
  for (const v of data) {
    if (v < 0 || v >> from !== 0) return null;
    acc = (acc << from) | v;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (to - bits)) & maxv);
  } else if (bits >= from || ((acc << (to - bits)) & maxv) !== 0) {
    return null;
  }
  return out;
}

export interface DecodedInvoice {
  /** Amount in sats (null = amountless invoice). */
  amountSats: number | null;
  /** 32-byte payment hash, hex. */
  paymentHash: string;
  /** Description string (tag `d`), if present. */
  description: string | null;
  /** Expiry in seconds (default 3600), if present. */
  expirySeconds: number;
  network: string;
}

/** Parse the amount encoded in a BOLT11 HRP, e.g. `lnbc2500u` → 250,000 sats. */
export function parseBolt11Amount(hrp: string): number | null {
  const m = /^ln(bc|tb|bcrt)(\d*)([munp]?)$/.exec(hrp);
  if (!m) return null;
  if (!m[2]) return null; // amountless
  const value = Number(m[2]);
  if (!Number.isFinite(value)) return null;
  const mult: Record<string, number> = { m: 1e5, u: 100, n: 0.1, p: 0.0001, "": 1e8 };
  return Math.round(value * (mult[m[3]] ?? 0));
}

export function decodeBolt11(invoice: string): DecodedInvoice | null {
  const dec = bech32Decode(invoice.trim());
  if (!dec) return null;
  const amountSats = parseBolt11Amount(dec.hrp);
  const network = dec.hrp.startsWith("lnbc")
    ? "mainnet"
    : dec.hrp.startsWith("lntb")
      ? "testnet"
      : dec.hrp.startsWith("lnbcrt")
        ? "regtest"
        : "unknown";
  if (network === "unknown") return null;

  const d = dec.data;
  // BOLT11 layout after the HRP: timestamp (7 groups of 5 bits = 35 bits),
  // then tagged fields, then the 65-byte signature (104 groups).
  // The timestamp is NOT a tagged field, parsing must start after it,
  // and stop before the signature, or the first tag reads garbage.
  if (d.length < 7 + 104) return null;
  const tagEnd = d.length - 104;

  // Tagged fields: 5 bits type, 10 bits length, then length*5 bits data.
  let paymentHash: string | null = null;
  let description: string | null = null;
  let expirySeconds = 3600;
  let i = 7; // skip the 35-bit timestamp
  while (i + 3 <= tagEnd) {
    const type = d[i];
    const len = (d[i + 1] << 5) | d[i + 2];
    const field = d.slice(i + 3, i + 3 + len);
    if (field.length < len) break;
    i += 3 + len;
    const bytes = convertBits(field, 5, 8, false);
    if (type === 1 && bytes && bytes.length === 32) {
      // tag `p`, payment hash
      paymentHash = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
    } else if (type === 13 && bytes) {
      // tag `d`, description
      description = new TextDecoder().decode(new Uint8Array(bytes));
    } else if (type === 6 && field.length > 0) {
      // tag `x`, expiry seconds, a big-endian integer over 5-bit
      // groups. (convertBits would reject it: 15 bits is 1 byte + 7
      // leftover bits, and pad=false refuses ≥5 leftover bits.)
      expirySeconds = field.reduce((acc, g) => acc * 32 + g, 0);
    }
  }
  if (!paymentHash) return null;
  return { amountSats, paymentHash, description, expirySeconds, network };
}

/** Parse a Lighnib memo `Lighnib:order#<orderId>:<supplierId>`. */
export function parseLighnibMemo(
  description: string | null,
): { orderId: string; supplierId: string } | null {
  if (!description) return null;
  const m = /^Lighnib:order#([^:]+):([^:\s]+)\s*(.*)?$/.exec(description.trim());
  if (!m) return null;
  return { orderId: m[1], supplierId: m[2] };
}
