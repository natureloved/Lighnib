/**
 * Dispute tests, INV-7.
 * Open only against a bound receipt; only the named mediator releases;
 * only to a party named in the receipt; timeout auto-refunds.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  assignMediator,
  buildBoundReceipt,
  checkDisputeTimeout,
  mediatorRelease,
  openDispute,
  hexToBytes,
  sha256Hex,
  type BoundReceipt,
  type Dispute,
} from "../packages/shared/src/index";

const PREIMAGE = "ab".repeat(32);
const PAYMENT_HASH = sha256Hex(hexToBytes(PREIMAGE));
const MEDIATOR = "Lagos market association";

function receipt(): BoundReceipt {
  return buildBoundReceipt({
    id: "rcpt_1",
    orderId: "ORD-1001",
    supplierId: "supplier-001",
    vendorName: "Mama Nkechi provisions",
    purpose: "10 bags of rice",
    amountSats: 12_500,
    amountFiat: 12_500,
    currency: "NGN",
    paymentHash: PAYMENT_HASH,
    preimage: PREIMAGE,
    payerPubkey: "c".repeat(64),
  });
}

function dispute(now = new Date("2026-11-16T12:00:00Z")): Dispute {
  return openDispute(receipt(), {
    id: "dispute_1",
    buyerPubkey: "c".repeat(64),
    mediator: MEDIATOR,
    holdWindowMinutes: 10,
    now,
  });
}

test("INV-7: dispute opens against a settled bound receipt", () => {
  const d = dispute();
  assert.equal(d.state, "OPEN");
  assert.equal(d.receiptId, "rcpt_1");
  assert.equal(d.mediator, MEDIATOR);
  assert.equal(d.supplierId, "supplier-001");
  // Deadline is the hold window after opening (10 min).
  assert.equal(
    new Date(d.deadlineAt).getTime() - new Date(d.openedAt).getTime(),
    10 * 60_000,
  );
});

test("INV-7: dispute refuses a non-settled receipt", () => {
  const unsettled = { ...receipt(), status: "PENDING" } as unknown as BoundReceipt;
  assert.throws(
    () =>
      openDispute(unsettled, {
        id: "d2",
        buyerPubkey: "c".repeat(64),
        mediator: MEDIATOR,
        holdWindowMinutes: 10,
      }),
    /INV-7/,
  );
});

test("dispute: OPEN → MEDIATOR_REVIEW → RELEASED to supplier", () => {
  let d = dispute();
  d = assignMediator(d);
  assert.equal(d.state, "MEDIATOR_REVIEW");
  d = mediatorRelease(d, {
    mediator: MEDIATOR,
    to: "supplier",
    now: new Date("2026-11-16T12:05:00Z"),
  });
  assert.equal(d.state, "RELEASED");
  assert.equal(d.releasedTo, "supplier");
});

test("INV-7: only the named mediator can release", () => {
  const d = dispute();
  assert.throws(
    () => mediatorRelease(d, { mediator: "Some other person", to: "supplier" }),
    /only the named mediator/,
  );
});

test("INV-7: release only to a party named in the receipt", () => {
  const d = dispute();
  const inWindow = new Date("2026-11-16T12:05:00Z");
  // "buyer" and "supplier" are the only parties named in the receipt.
  assert.throws(
    () =>
      mediatorRelease(d, {
        mediator: MEDIATOR,
        to: "random-third-party" as "buyer",
        now: inWindow,
      }),
    /only to a party named in the receipt/,
  );
  // Both named parties are releasable.
  const toBuyer = mediatorRelease(dispute(), {
    mediator: MEDIATOR,
    to: "buyer",
    now: inWindow,
  });
  assert.equal(toBuyer.releasedTo, "buyer");
});

test("dispute: no release after the hold-window deadline", () => {
  const d = dispute();
  assert.throws(
    () =>
      mediatorRelease(d, {
        mediator: MEDIATOR,
        to: "supplier",
        now: new Date("2026-11-16T12:11:00Z"),
      }),
    /past hold-window deadline/,
  );
});

test("dispute: timeout auto-refunds to the buyer", () => {
  const d = dispute();
  // Before deadline: no timeout.
  assert.equal(checkDisputeTimeout(d, new Date("2026-11-16T12:05:00Z")), null);
  // After deadline: auto-refund.
  const timedOut = checkDisputeTimeout(d, new Date("2026-11-16T12:11:00Z"));
  assert.ok(timedOut);
  assert.equal(timedOut.state, "REFUNDED");
  assert.equal(timedOut.releasedTo, "buyer");
});

test("dispute: released disputes do not time out", () => {
  const released = mediatorRelease(dispute(), {
    mediator: MEDIATOR,
    to: "supplier",
    now: new Date("2026-11-16T12:02:00Z"),
  });
  assert.equal(checkDisputeTimeout(released, new Date("2026-11-16T13:00:00Z")), null);
});
