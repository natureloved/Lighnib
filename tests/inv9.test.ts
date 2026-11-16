/**
 * INV-9 tests — invoice↔supplier binding + BOLT11 decoding.
 * The unknown-hash refusal must happen BEFORE any wallet request:
 * the registry check is pure and synchronous, no wallet involved.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  InvoiceBindingRegistry,
  bech32Decode,
  buildLighnibMemo,
  decodeBolt11,
  hexToBytes,
  parseBolt11Amount,
  parseLighnibMemo,
  type InvoiceBinding,
} from "../packages/shared/src/index";

/* --- Minimal bech32 encoder, test-only, to build valid invoices --- */
const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
function polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= GEN[i];
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
function convertBits(data: number[], from: number, to: number, pad: boolean): number[] {
  let acc = 0, bits = 0;
  const out: number[] = [];
  const maxv = (1 << to) - 1;
  for (const v of data) {
    acc = (acc << from) | v;
    bits += from;
    while (bits >= to) { bits -= to; out.push((acc >> bits) & maxv); }
  }
  if (pad && bits > 0) out.push((acc << (to - bits)) & maxv);
  return out;
}
function bech32Encode(hrp: string, data5: number[]): string {
  const values = [...hrpExpand(hrp), ...data5];
  const mod = polymod([...values, 0, 0, 0, 0, 0, 0]) ^ 1;
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) checksum.push((mod >> (5 * (5 - i))) & 31);
  return hrp + "1" + [...data5, ...checksum].map((v) => CHARSET[v]).join("");
}
function buildInvoice(opts: { amountHrp: string; hashHex: string; description: string }): string {
  const hashBytes = [...hexToBytes(opts.hashHex)];
  const descBytes = [...new TextEncoder().encode(opts.description)];
  const field = (type: number, data8: number[]): number[] => {
    const d5 = convertBits(data8, 8, 5, true);
    return [type, (d5.length >> 5) & 31, d5.length & 31, ...d5];
  };
  const data5 = [
    ...field(1, hashBytes),
    ...field(13, descBytes),
    // signature placeholder (65 bytes of zeros) — decoder does not verify sig
    ...field(16, new Array(65).fill(0)),
  ];
  return bech32Encode(opts.amountHrp, data5);
}

const HASH = "11".repeat(32);
const MEMO = "Lighnib:order#ORD-1001:supplier-001";

function binding(overrides: Partial<InvoiceBinding> = {}): InvoiceBinding {
  return {
    paymentHash: HASH,
    supplierId: "supplier-001",
    supplierName: "Mama Nkechi provisions",
    orderId: "ORD-1001",
    amountSats: 12_500,
    memo: MEMO,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

test("INV-9: known hash + matching supplier + amount is allowed", () => {
  const reg = new InvoiceBindingRegistry();
  reg.record(binding());
  const check = reg.check(HASH, "supplier-001", 12_500);
  assert.equal(check.allowed, true);
  assert.equal(check.binding?.orderId, "ORD-1001");
});

test("INV-9: unknown hash refused BEFORE any wallet request", () => {
  const reg = new InvoiceBindingRegistry();
  reg.record(binding());
  // No wallet exists in this test at all — the refusal is pure registry logic.
  const check = reg.check("22".repeat(32), "supplier-001");
  assert.equal(check.allowed, false);
  assert.equal(check.reason, "UNKNOWN_INVOICE_HASH");
});

test("INV-9: supplier mismatch refused", () => {
  const reg = new InvoiceBindingRegistry();
  reg.record(binding());
  const check = reg.check(HASH, "supplier-999");
  assert.equal(check.allowed, false);
  assert.equal(check.reason, "SUPPLIER_MISMATCH");
});

test("INV-9: amount mismatch refused", () => {
  const reg = new InvoiceBindingRegistry();
  reg.record(binding());
  const check = reg.check(HASH, "supplier-001", 99_999);
  assert.equal(check.allowed, false);
  assert.equal(check.reason, "AMOUNT_MISMATCH");
});

test("INV-9: recording the same hash twice is refused", () => {
  const reg = new InvoiceBindingRegistry();
  reg.record(binding());
  assert.throws(() => reg.record(binding()), /already bound/);
});

test("memo build/parse round-trips", () => {
  const memo = buildLighnibMemo("ORD-1001", "supplier-001");
  assert.equal(memo, MEMO);
  assert.deepEqual(parseLighnibMemo(memo), { orderId: "ORD-1001", supplierId: "supplier-001" });
  assert.equal(parseLighnibMemo("random description"), null);
  assert.equal(parseLighnibMemo(null), null);
});

test("BOLT11 amount parsing", () => {
  assert.equal(parseBolt11Amount("lnbc2500u"), 250_000);
  assert.equal(parseBolt11Amount("lnbc1"), 100_000_000);
  assert.equal(parseBolt11Amount("lnbc20m"), 2_000_000);
  assert.equal(parseBolt11Amount("lnbc"), null); // amountless
});

test("BOLT11 decode round-trip: hash + amount + memo from a built invoice", () => {
  const invoice = buildInvoice({ amountHrp: "lnbc12500u", hashHex: HASH, description: MEMO });
  const decoded = decodeBolt11(invoice);
  assert.ok(decoded, "invoice should decode");
  assert.equal(decoded.paymentHash, HASH);
  assert.equal(decoded.amountSats, 1_250_000); // 12500u = 1,250,000 sats
  assert.equal(decoded.description, MEMO);
  assert.deepEqual(parseLighnibMemo(decoded.description), {
    orderId: "ORD-1001",
    supplierId: "supplier-001",
  });
});

test("BOLT11 decode rejects bad checksum and garbage", () => {
  const invoice = buildInvoice({ amountHrp: "lnbc12500u", hashHex: HASH, description: MEMO });
  const corrupted = invoice.slice(0, -2) + (invoice.endsWith("q") ? "p" : "q") + invoice.slice(-1);
  assert.equal(bech32Decode(corrupted), null);
  assert.equal(decodeBolt11(corrupted), null);
  assert.equal(decodeBolt11("not an invoice"), null);
  assert.equal(decodeBolt11(""), null);
});
