/**
 * Disputes (INV-7) — stretch feature, inside the NIP-47 hold window.
 *
 * - A dispute opens ONLY against a bound receipt.
 * - Only the NAMED mediator can release.
 * - Release goes ONLY to a party named in the receipt (buyer or supplier).
 * - Past the hold-window deadline the payment auto-refunds to the buyer.
 * - A release is a public event (recorded on the dispute).
 *
 * State machine: OPEN → MEDIATOR_REVIEW → RELEASED | REFUNDED.
 * (MEDIATOR_REVIEW is optional — OPEN may release directly.)
 */

import type { BoundReceipt, Dispute } from "./types";

export function openDispute(
  receipt: BoundReceipt,
  input: {
    id: string;
    buyerPubkey: string;
    mediator: string;
    holdWindowMinutes: number;
    now?: Date;
  },
): Dispute {
  // INV-7: dispute only against a bound receipt.
  if (!receipt || receipt.status !== "SETTLED") {
    throw new Error("INV-7: dispute requires a settled bound receipt");
  }
  const now = input.now ?? new Date();
  return {
    id: input.id,
    receiptId: receipt.id,
    buyerPubkey: input.buyerPubkey,
    supplierId: receipt.supplierId,
    mediator: input.mediator,
    state: "OPEN",
    openedAt: now.toISOString(),
    deadlineAt: new Date(
      now.getTime() + input.holdWindowMinutes * 60_000,
    ).toISOString(),
    releasedTo: null,
    releasedAt: null,
  };
}

/** Move a dispute into mediator review. */
export function assignMediator(dispute: Dispute): Dispute {
  if (dispute.state !== "OPEN") {
    throw new Error(`Cannot assign mediator from state ${dispute.state}`);
  }
  return { ...dispute, state: "MEDIATOR_REVIEW" };
}

/**
 * INV-7: only the named mediator releases, and only to a party named
 * in the receipt (buyer = refund, supplier = pay out).
 */
export function mediatorRelease(
  dispute: Dispute,
  input: { mediator: string; to: "buyer" | "supplier"; now?: Date },
): Dispute {
  if (dispute.state !== "OPEN" && dispute.state !== "MEDIATOR_REVIEW") {
    throw new Error(`Cannot release a dispute in state ${dispute.state}`);
  }
  if (input.mediator !== dispute.mediator) {
    throw new Error("INV-7: only the named mediator can release");
  }
  if (input.to !== "buyer" && input.to !== "supplier") {
    throw new Error("INV-7: release only to a party named in the receipt (buyer or supplier)");
  }
  const now = input.now ?? new Date();
  if (new Date(dispute.deadlineAt).getTime() <= now.getTime()) {
    throw new Error("Dispute past hold-window deadline — auto-refund applies, no release");
  }
  return {
    ...dispute,
    state: "RELEASED",
    releasedTo: input.to,
    releasedAt: now.toISOString(),
  };
}

/**
 * Timeout: past the hold-window deadline, the held payment auto-refunds
 * to the buyer. Returns the updated dispute, or null if not yet timed out.
 */
export function checkDisputeTimeout(dispute: Dispute, now: Date = new Date()): Dispute | null {
  if (dispute.state !== "OPEN" && dispute.state !== "MEDIATOR_REVIEW") return null;
  if (new Date(dispute.deadlineAt).getTime() > now.getTime()) return null;
  return { ...dispute, state: "REFUNDED", releasedTo: "buyer", releasedAt: now.toISOString() };
}
