/**
 * Bound receipt tests, INV-5, INV-6.
 * Every settled payment MUST be a bound receipt; a receipt exists only
 * AFTER settlement and carries amount + vendor + purpose + hash + preimage.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBoundReceipt,
  receiptFiat,
  receiptSummary,
  hexToBytes,
  sha256Hex,
  verifyReceipt,
} from "../packages/shared/src/index";

// A real preimage/hash pair: sha256(preimage) === paymentHash.
const PREIMAGE = "ab".repeat(32);
const PAYMENT_HASH = sha256Hex(hexToBytes(PREIMAGE));

function receiptInput(overrides: Record<string, unknown> = {}) {
  return {
    id: "rcpt_1",
    orderId: "ORD-1001",
    supplierId: "supplier-001",
    vendorName: "Mama Nkechi provisions",
    purpose: "10 bags of rice",
    amountSats: 12_500,
    amountFiat: 12_500,
    currency: "NGN" as const,
    paymentHash: PAYMENT_HASH,
    preimage: PREIMAGE,
    payerPubkey: "c".repeat(64),
    ...overrides,
  };
}

test("sha256 known vector", () => {
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("INV-5/INV-6: settled payment builds a complete bound receipt", () => {
  const r = buildBoundReceipt(receiptInput());
  assert.equal(r.status, "SETTLED");
  assert.equal(r.paymentHash, PAYMENT_HASH);
  assert.equal(r.preimage, PREIMAGE);
  assert.equal(r.vendorName, "Mama Nkechi provisions");
  assert.equal(r.purpose, "10 bags of rice");
  assert.equal(verifyReceipt(r), true);
  // Nostr event carries the receipt publicly (verifiable by a third party).
  const content = JSON.parse(r.nostrEvent.content) as Record<string, unknown>;
  assert.equal(content.type, "lighnib-receipt");
  assert.equal(content.paymentHash, PAYMENT_HASH);
});

test("INV-6: no receipt without a preimage (never 9735 alone)", () => {
  assert.throws(() => buildBoundReceipt(receiptInput({ preimage: "" })), /INV-6/);
  assert.throws(() => buildBoundReceipt(receiptInput({ preimage: "zz" })), /INV-6/);
});

test("INV-6: no receipt without a valid payment hash", () => {
  assert.throws(() => buildBoundReceipt(receiptInput({ paymentHash: "" })), /INV-6/);
});

test("INV-6: preimage must match the payment hash", () => {
  assert.throws(
    () => buildBoundReceipt(receiptInput({ preimage: "cd".repeat(32) })),
    /does not match payment hash/,
  );
});

test("INV-6: no receipt without vendor, purpose, or positive amount", () => {
  assert.throws(() => buildBoundReceipt(receiptInput({ vendorName: "" })), /INV-6/);
  assert.throws(() => buildBoundReceipt(receiptInput({ purpose: "" })), /INV-6/);
  assert.throws(() => buildBoundReceipt(receiptInput({ amountSats: 0 })), /INV-6/);
});

test("verifyReceipt rejects tampered receipts", () => {
  const r = buildBoundReceipt(receiptInput());
  // Tampered amount no longer matches the Nostr event content.
  assert.equal(verifyReceipt({ ...r, amountSats: 99_999 }), false);
  assert.equal(verifyReceipt({ ...r, vendorName: "Someone else" }), false);
  assert.equal(verifyReceipt({ ...r, preimage: "cd".repeat(32) }), false);
  assert.equal(verifyReceipt({ ...r, status: "SETTLED", paymentHash: "00".repeat(32) }), false);
});

test("receiptSummary is a readable Pidgin/English line", () => {
  const r = buildBoundReceipt(receiptInput());
  const s = receiptSummary(r, "₦");
  assert.match(s, /Mama Nkechi provisions/);
  assert.match(s, /12,500 sats/);
  assert.match(s, /10 bags of rice/);
});

test("receiptFiat derives naira from sats when the stored fiat is zero", () => {
  const r = buildBoundReceipt(receiptInput({ amountSats: 100, amountFiat: 0 }));
  assert.equal(receiptFiat(r), 84);
  assert.match(receiptSummary(r, "₦"), /₦84 \(100 sats\)/);
});

test("receiptFiat keeps a stored fiat when one is present", () => {
  const r = buildBoundReceipt(receiptInput());
  assert.equal(receiptFiat(r), 12_500);
});

test("KNOWN LIMITATION: tampering BOTH copies of a field passes the verifier", () => {
  // The verifier checks that the receipt fields match their embedded
  // Nostr event record, but no event signature is verified. Changing
  // the vendor and amount in the receipt AND in the embedded content
  // together passes every check (Nov 21 review). This test documents
  // the limitation so nobody mistakes the verifier for authentication
  // of the supplier, order, or purpose. The fix is a signed canonical
  // receipt, a Phase 1 hardening item, not a demo change.
  const r = buildBoundReceipt(receiptInput());
  const content = JSON.parse(r.nostrEvent.content) as Record<string, unknown>;
  const tampered = {
    ...r,
    vendorName: "Somebody else",
    amountSats: 99_999,
    nostrEvent: {
      ...r.nostrEvent,
      content: JSON.stringify({
        ...content,
        vendor: "Somebody else",
        amountSats: 99_999,
      }),
    },
  };
  assert.equal(verifyReceipt(tampered), true);
});
