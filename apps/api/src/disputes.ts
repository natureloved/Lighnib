/**
 * disputes.ts — dispute state machine (INV-7), inside the hold window.
 * The mediator is named in config/locale.ts (Lagos market association).
 * Only that mediator releases; only to a party named in the receipt.
 * Past the deadline the payment auto-refunds to the buyer.
 */

import { LOCALE } from "@lighnib/shared";
import {
  assignMediator,
  checkDisputeTimeout,
  mediatorRelease,
  openDispute,
  type BoundReceipt,
  type Dispute,
} from "@lighnib/shared";
import { getReceipt } from "./receipts";

const disputes = new Map<string, Dispute>();

export function openDisputeForReceipt(input: {
  receiptId: string;
  buyerPubkey: string;
}): Dispute {
  const receipt: BoundReceipt | undefined = getReceipt(input.receiptId);
  if (!receipt) throw new Error(`INV-7: no bound receipt ${input.receiptId} — dispute refused`);
  const id = `dispute_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const dispute = openDispute(receipt, {
    id,
    buyerPubkey: input.buyerPubkey,
    mediator: LOCALE.mediator,
    holdWindowMinutes: LOCALE.holdWindowMinutes,
  });
  disputes.set(id, dispute);
  return dispute;
}

export function getDispute(id: string): Dispute | undefined {
  return disputes.get(id);
}

export function listDisputes(): Dispute[] {
  return [...disputes.values()];
}

export function reviewDispute(id: string): Dispute {
  const dispute = disputes.get(id);
  if (!dispute) throw new Error(`Unknown dispute: ${id}`);
  const next = assignMediator(dispute);
  disputes.set(id, next);
  return next;
}

export function releaseDispute(
  id: string,
  input: { mediator: string; to: "buyer" | "supplier" },
): Dispute {
  const dispute = disputes.get(id);
  if (!dispute) throw new Error(`Unknown dispute: ${id}`);
  const next = mediatorRelease(dispute, input);
  disputes.set(id, next);
  return next;
}

/** Timeout check: past the hold window, auto-refund to the buyer. */
export function timeoutCheckDispute(id: string, now: Date = new Date()): Dispute | null {
  const dispute = disputes.get(id);
  if (!dispute) throw new Error(`Unknown dispute: ${id}`);
  const timedOut = checkDisputeTimeout(dispute, now);
  if (timedOut) disputes.set(id, timedOut);
  return timedOut;
}
