/**
 * Payment-reconcile tests (Nov 21 review, item 7).
 *
 * A payment that settles at the wallet but fails in the API must be
 * recoverable without a blind retry. Receipt creation and scope
 * settlement are idempotent by payment hash, and reconcilePayment
 * rebuilds the receipt from the preimage the wallet returned.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  buildBoundReceipt,
  hexToBytes,
  sha256Hex,
} from "../packages/shared/src/index";
import {
  beginPayment,
  createScopeRecord,
  getScope,
  settlePayment,
} from "../apps/api/src/scope";
import {
  createReceipt,
  getReceiptByHash,
  listReceipts,
  reconcilePayment,
} from "../apps/api/src/receipts";

/**
 * Random preimages per run, so the persisted receipts file (the API
 * module loads apps/api/data/receipts.json at import) can never collide
 * with a hash from an earlier run.
 */
const PREIMAGE = randomBytes(32).toString("hex");
const PAYMENT_HASH = sha256Hex(hexToBytes(PREIMAGE));
const OTHER_PREIMAGE = randomBytes(32).toString("hex");
const OTHER_HASH = sha256Hex(hexToBytes(OTHER_PREIMAGE));

function receiptInput(overrides: Record<string, unknown> = {}) {
  return {
    id: `rcpt_reconcile_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    orderId: "ORD-REC-1",
    supplierId: "supplier-balogun-001",
    vendorName: "Balogun provisions, Mama Nkechi",
    purpose: "2 bags of rice",
    amountSats: 100,
    amountFiat: 84,
    currency: "NGN" as const,
    paymentHash: PAYMENT_HASH,
    preimage: PREIMAGE,
    payerPubkey: "b".repeat(64),
    ...overrides,
  };
}

function payingScope() {
  const scope = createScopeRecord({
    walletPubkey: "b".repeat(64),
    dailyBudgetSats: 33_333,
    dailyBudgetFiat: 50_000,
    currency: "NGN",
    sessionHours: 8,
  });
  return beginPayment(scope.id, 100);
}

test("createReceipt is idempotent by payment hash", () => {
  const before = listReceipts().length;
  const first = createReceipt(receiptInput());
  const second = createReceipt(
    receiptInput({ id: "rcpt_reconcile_other_id" }),
  );
  assert.equal(second.id, first.id);
  assert.equal(listReceipts().length, before + 1);
  assert.equal(getReceiptByHash(PAYMENT_HASH)?.id, first.id);
});

test("settlePayment is idempotent by payment hash", () => {
  const scope = payingScope();
  const once = getScope(scope.id)!;
  assert.equal(once.state, "PAYING");
  const settled = settlePayment(scope.id, 100, OTHER_HASH);
  assert.equal(settled.spentTodaySats, 100);
  assert.equal(settled.state, "RECEIPTED");
  const again = settlePayment(scope.id, 100, OTHER_HASH);
  assert.equal(again.spentTodaySats, 100);
});

test("reconcilePayment recovers a receipt and settles the scope once", () => {
  const scope = payingScope();
  const input = {
    scopeId: scope.id,
    paymentHash: OTHER_HASH,
    preimage: OTHER_PREIMAGE,
    orderId: "ORD-REC-2",
    supplierId: "supplier-balogun-001",
    vendorName: "Balogun provisions, Mama Nkechi",
    purpose: "1 bag of beans",
    amountSats: 100,
    amountFiat: 84,
    currency: "NGN" as const,
    payerPubkey: "b".repeat(64),
  };
  const first = reconcilePayment(input);
  assert.equal(first.receipt.paymentHash, OTHER_HASH);
  assert.equal(first.settled, true);
  assert.equal(first.scope?.state, "RECEIPTED");
  assert.equal(first.scope?.spentTodaySats, 100);
  const second = reconcilePayment(input);
  assert.equal(second.receipt.id, first.receipt.id);
  assert.equal(second.scope?.spentTodaySats, 100);
});

test("reconcilePayment refuses a preimage that does not match the hash", () => {
  const scope = payingScope();
  assert.throws(
    () =>
      reconcilePayment({
        scopeId: scope.id,
        paymentHash: OTHER_HASH,
        preimage: PREIMAGE,
        orderId: "ORD-REC-3",
        supplierId: "supplier-balogun-001",
        vendorName: "Balogun provisions, Mama Nkechi",
        purpose: "forged",
        amountSats: 100,
        amountFiat: 84,
        currency: "NGN",
        payerPubkey: "b".repeat(64),
      }),
    /preimage does not match payment hash/,
  );
  assert.equal(getScope(scope.id)?.state, "PAYING");
});

test("reconcilePayment after a settle that already landed leaves the scope alone", () => {
  const scope = payingScope();
  settlePayment(scope.id, 100, OTHER_HASH);
  assert.equal(getScope(scope.id)?.state, "RECEIPTED");
  const result = reconcilePayment({
    scopeId: scope.id,
    paymentHash: OTHER_HASH,
    preimage: OTHER_PREIMAGE,
    orderId: "ORD-REC-2",
    supplierId: "supplier-balogun-001",
    vendorName: "Balogun provisions, Mama Nkechi",
    purpose: "1 bag of beans",
    amountSats: 100,
    amountFiat: 84,
    currency: "NGN",
    payerPubkey: "b".repeat(64),
  });
  assert.equal(result.settled, false);
  assert.equal(result.scope?.spentTodaySats, 100);
  assert.equal(result.receipt.paymentHash, OTHER_HASH);
});

// Sanity: the shared builder still refuses a bad preimage on its own.
test("buildBoundReceipt refuses a mismatched preimage", () => {
  assert.throws(
    () => buildBoundReceipt(receiptInput({ preimage: OTHER_PREIMAGE })),
    /preimage does not match payment hash/,
  );
});
