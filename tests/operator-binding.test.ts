/**
 * Operator-binding tests, POST /api/invoices gate (Nov 21 review, item 3).
 *
 * The INV-9 binding registry is the ONLY supplier enforcement Lighnib
 * has, so writing it must be operator-only, and a binding whose memo
 * names a different supplier or order than the body claims must be
 * refused. The route itself (apps/api/src/index.ts) calls these two
 * helpers; the Fastify app is not imported here because it listens on
 * import, so the helpers are tested directly.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { checkOperatorKey } from "../apps/api/src/operator";
import {
  bindings,
  recordBinding,
  validateBindingMemo,
} from "../apps/api/src/receipts";

const HASH = (tag: string) =>
  Buffer.from(tag.padEnd(32, "0")).toString("hex").slice(0, 64);

function binding(overrides: Record<string, unknown> = {}) {
  const hash = HASH((overrides.paymentHash as string) ?? "opbind");
  return {
    paymentHash: hash,
    supplierId: "supplier-balogun-001",
    supplierName: "Balogun provisions",
    orderId: "ORD-OP-1",
    amountSats: 100,
    memo: "Lighnib:order#ORD-OP-1:supplier-balogun-001",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

test("checkOperatorKey: matching key passes", () => {
  assert.equal(
    checkOperatorKey({ "x-operator-key": "secret-key" }, "secret-key"),
    "ok",
  );
});

test("checkOperatorKey: wrong or missing key is unauthorized", () => {
  assert.equal(
    checkOperatorKey({ "x-operator-key": "wrong" }, "secret-key"),
    "unauthorized",
  );
  assert.equal(checkOperatorKey({}, "secret-key"), "unauthorized");
  assert.equal(
    checkOperatorKey({ "x-operator-key": ["a", "b"] }, "secret-key"),
    "unauthorized",
  );
});

test("checkOperatorKey: no configured key means not-configured", () => {
  assert.equal(checkOperatorKey({ "x-operator-key": "x" }, undefined), "not-configured");
  assert.equal(checkOperatorKey({}, undefined), "not-configured");
});

test("validateBindingMemo: matching memo passes", () => {
  validateBindingMemo(binding());
});

test("validateBindingMemo: memo naming another supplier is refused", () => {
  assert.throws(
    () =>
      validateBindingMemo(
        binding({ memo: "Lighnib:order#ORD-OP-1:supplier-002" }),
      ),
    /memo supplier does not match/,
  );
});

test("validateBindingMemo: memo naming another order is refused", () => {
  assert.throws(
    () =>
      validateBindingMemo(
        binding({ memo: "Lighnib:order#ORD-OTHER:supplier-balogun-001" }),
      ),
    /memo order does not match/,
  );
});

test("validateBindingMemo: missing or malformed memo is refused", () => {
  assert.throws(() => validateBindingMemo(binding({ memo: "" })), /memo/);
  assert.throws(
    () => validateBindingMemo(binding({ memo: "not a lighnib memo" })),
    /memo/,
  );
});

test("cross-supplier registration never reaches the registry", () => {
  const bad = binding({
    paymentHash: HASH("opbind-cross"),
    memo: "Lighnib:order#ORD-OP-1:supplier-002",
  });
  assert.throws(() => validateBindingMemo(bad), /memo supplier/);
  assert.equal(bindings.get(bad.paymentHash), undefined);
  const good = binding({ paymentHash: HASH("opbind-good") });
  validateBindingMemo(good);
  recordBinding(good);
  assert.equal(bindings.get(good.paymentHash)?.supplierId, "supplier-balogun-001");
});
