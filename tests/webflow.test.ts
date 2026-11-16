/**
 * Web-flow tests — the /pay orchestration (lib/pay-flow.ts) and the
 * /wallet data contract, tested without a browser.
 *
 * The stubs use the REAL shared modules (scope state machine, INV-9
 * registry, buildBoundReceipt) — only the wallet pay call and the HTTP
 * transport are stubbed. So a test failure here means the flow order
 * itself is wrong, not a mock.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBoundReceipt,
  checkSpend,
  createScope,
  hexToBytes,
  InvoiceBindingRegistry,
  recordSpend,
  remainingBudgetSats,
  revokeScope,
  sha256Hex,
  transitionScope,
  type Scope,
} from "../packages/shared/src/index";
import {
  runPayFlow,
  type PayFlowApi,
} from "../apps/web/src/lib/pay-flow";

/** A real preimage/hash pair (sha256(preimage) == paymentHash). */
const PREIMAGE = "11".repeat(32);
const PAYMENT_HASH = sha256Hex(hexToBytes(PREIMAGE));

const SUPPLIER_ID = "supplier-balogun-001";
const SUPPLIER_NAME = "Balogun provisions — Mama Nkechi";

function liveScope(overrides: Partial<Scope> = {}): Scope {
  return {
    ...createScope({
      id: "scope_webflow",
      walletPubkey: "b".repeat(64),
      dailyBudgetSats: 33_333,
      dailyBudgetFiat: 50_000,
      currency: "NGN",
      sessionHours: 8,
    }),
    ...overrides,
  };
}

/** Stub API backed by the real shared logic; records call order. */
function stubApi(opts: {
  scope?: Scope;
  decode?: {
    valid: boolean;
    amountSats?: number | null;
    paymentHash?: string;
    description?: string | null;
    memo?: { orderId: string; supplierId: string } | null;
  };
  registry?: InvoiceBindingRegistry;
  payShouldThrow?: Error;
} = { scope: liveScope() }): {
  api: PayFlowApi;
  calls: string[];
  scope: () => Scope;
  payCalls: number;
} {
  const calls: string[] = [];
  let scope = opts.scope ?? liveScope();
  const registry =
    opts.registry ??
    (() => {
      const r = new InvoiceBindingRegistry();
      r.record({
        paymentHash: PAYMENT_HASH,
        supplierId: SUPPLIER_ID,
        supplierName: SUPPLIER_NAME,
        orderId: "ORD-WEBFLOW-1",
        amountSats: 100,
        memo: `Lighnib:order#ORD-WEBFLOW-1:${SUPPLIER_ID}`,
        createdAt: new Date().toISOString(),
      });
      return r;
    })();
  const decode = opts.decode ?? {
    valid: true,
    amountSats: 100,
    paymentHash: PAYMENT_HASH,
    description: "2 bags of rice",
    memo: { orderId: "ORD-WEBFLOW-1", supplierId: SUPPLIER_ID },
  };
  let payCalls = 0;
  const api: PayFlowApi = {
    decodeInvoice: async () => {
      calls.push("decode");
      return decode;
    },
    checkBinding: async (hash, supplierId, amountSats) => {
      calls.push("checkBinding");
      return registry.check(hash, supplierId, amountSats);
    },
    checkSpend: async (_id, amountSats) => {
      calls.push("checkSpend");
      return checkSpend(scope, amountSats);
    },
    beginPayment: async (_id, amountSats) => {
      calls.push("beginPayment");
      const check = checkSpend(scope, amountSats);
      if (!check.allowed) throw new Error(`Payment refused: ${check.reason}`);
      scope = { ...scope, state: transitionScope(scope.state, "PAYING") };
      return scope;
    },
    settlePayment: async (_id, amountSats) => {
      calls.push("settlePayment");
      scope = recordSpend(scope, amountSats);
      return scope;
    },
    cancelPayment: async () => {
      calls.push("cancelPayment");
      if (scope.state === "PAYING") {
        scope = { ...scope, state: transitionScope("PAYING", "LOGGED_IN") };
      }
      return scope;
    },
    createReceipt: async (input) => {
      calls.push("createReceipt");
      return buildBoundReceipt(input as unknown as Parameters<typeof buildBoundReceipt>[0]);
    },
    explainReceipt: async () => {
      calls.push("explainReceipt");
      return { text: "You pay 100 sats to Balogun provisions for 2 bags of rice.", source: "template" as const };
    },
  };
  return {
    api,
    calls,
    scope: () => scope,
    get payCalls() {
      return payCalls;
    },
  };
}

function stubPay(preimage = PREIMAGE) {
  let calls = 0;
  const fn = async (_invoice: string) => {
    calls++;
    return { preimage };
  };
  return { fn, get calls() { return calls; } };
}

function stubSpeak() {
  const spoken: string[] = [];
  return { fn: (t: string) => { spoken.push(t); }, spoken };
}

const INPUT = {
  scope: liveScope(),
  walletPubkey: "b".repeat(64),
  supplierId: SUPPLIER_ID,
  supplierName: SUPPLIER_NAME,
  invoice: "lnbc100n1pwebflow",
};

test("happy path: decode → INV-9 → budget → begin → pay → settle → receipt → explain → speak, in order", async () => {
  const s = stubApi();
  const pay = stubPay();
  const speak = stubSpeak();
  const result = await runPayFlow(s.api, pay.fn, speak.fn, {
    ...INPUT,
    scope: s.scope(),
  });
  assert.deepEqual(s.calls, [
    "decode",
    "checkBinding",
    "checkSpend",
    "beginPayment",
    "settlePayment",
    "createReceipt",
    "explainReceipt",
  ]);
  assert.equal(pay.calls, 1);
  assert.equal(result.receipt.paymentHash, PAYMENT_HASH);
  assert.equal(result.receipt.preimage, PREIMAGE);
  assert.equal(result.receipt.supplierId, SUPPLIER_ID);
  assert.equal(result.receipt.vendorName, SUPPLIER_NAME);
  assert.equal(result.receipt.amountSats, 100);
  assert.equal(result.receipt.status, "SETTLED");
  assert.equal(result.explanationSource, "template");
  assert.equal(speak.spoken.length, 1);
  assert.match(speak.spoken[0], /100 sats/);
  // Settled scope carries the spend — the /wallet tab reads this.
  assert.equal(result.scope.spentTodaySats, 100);
  assert.equal(result.scope.state, "RECEIPTED");
  assert.equal(remainingBudgetSats(result.scope), 33_333 - 100);
});

test("INV-9 unknown hash: refused before any wallet request, no scope change", async () => {
  const s = stubApi({
    registry: new InvoiceBindingRegistry(), // empty — hash never recorded
  });
  const pay = stubPay();
  const speak = stubSpeak();
  await assert.rejects(
    runPayFlow(s.api, pay.fn, speak.fn, { ...INPUT, scope: s.scope() }),
    /INV-9: this invoice hash no dey recorded/,
  );
  assert.equal(pay.calls, 0);
  assert.deepEqual(s.calls, ["decode", "checkBinding"]);
  assert.equal(s.scope().state, "LOGGED_IN");
  assert.equal(speak.spoken.length, 0);
});

test("INV-9 supplier mismatch: refused before any wallet request", async () => {
  const s = stubApi();
  const pay = stubPay();
  const speak = stubSpeak();
  await assert.rejects(
    runPayFlow(s.api, pay.fn, speak.fn, {
      ...INPUT,
      scope: s.scope(),
      supplierId: "supplier-999",
    }),
    /INV-9: payment refused — SUPPLIER_MISMATCH/,
  );
  assert.equal(pay.calls, 0);
  assert.deepEqual(s.calls, ["decode", "checkBinding"]);
});

test("over-budget invoice: refused by the app scope check, wallet never asked", async () => {
  const s = stubApi({
    scope: liveScope({ dailyBudgetSats: 50 }),
    decode: {
      valid: true,
      amountSats: 100,
      paymentHash: PAYMENT_HASH,
      description: "2 bags of rice",
      memo: { orderId: "ORD-WEBFLOW-1", supplierId: SUPPLIER_ID },
    },
  });
  // Binding must allow the amount for the budget check to be the refuser.
  const pay = stubPay();
  const speak = stubSpeak();
  await assert.rejects(
    runPayFlow(s.api, pay.fn, speak.fn, { ...INPUT, scope: s.scope() }),
    /Over budget: QUOTA_EXCEEDED/,
  );
  assert.equal(pay.calls, 0);
  assert.ok(!s.calls.includes("beginPayment"));
});

test("invalid BOLT11: refused before any wallet request", async () => {
  const s = stubApi({ decode: { valid: false } });
  const pay = stubPay();
  const speak = stubSpeak();
  await assert.rejects(
    runPayFlow(s.api, pay.fn, speak.fn, { ...INPUT, scope: s.scope() }),
    /Invoice no valid/,
  );
  assert.equal(pay.calls, 0);
  assert.deepEqual(s.calls, ["decode"]);
});

test("amountless invoice: refused before any wallet request", async () => {
  const s = stubApi({
    decode: {
      valid: true,
      amountSats: 0,
      paymentHash: PAYMENT_HASH,
      description: "no amount",
      memo: { orderId: "ORD-WEBFLOW-1", supplierId: SUPPLIER_ID },
    },
  });
  const pay = stubPay();
  const speak = stubSpeak();
  await assert.rejects(
    runPayFlow(s.api, pay.fn, speak.fn, { ...INPUT, scope: s.scope() }),
    /Amountless invoices/,
  );
  assert.equal(pay.calls, 0);
});

test("wallet QUOTA_EXCEEDED: scope cancelled back to LOGGED_IN, no receipt, error propagates", async () => {
  const s = stubApi();
  const quotaError = Object.assign(new Error("The wallet has exceeded its spending quota."), {
    code: "QUOTA_EXCEEDED",
  });
  const pay = async (_invoice: string): Promise<{ preimage: string }> => {
    throw quotaError;
  };
  const speak = stubSpeak();
  await assert.rejects(
    runPayFlow(s.api, pay, speak.fn, { ...INPUT, scope: s.scope() }),
    /spending quota/,
  );
  assert.ok(s.calls.includes("cancelPayment"));
  assert.ok(!s.calls.includes("settlePayment"));
  assert.ok(!s.calls.includes("createReceipt"));
  assert.equal(s.scope().state, "LOGGED_IN");
  assert.equal(s.scope().spentTodaySats, 0);
  assert.equal(speak.spoken.length, 0);
});

test("revoked scope: beginPayment refuses, wallet never asked (INV-4)", async () => {
  const revoked = revokeScope(liveScope());
  const s = stubApi({ scope: revoked });
  const pay = stubPay();
  await assert.rejects(
    runPayFlow(s.api, pay.fn, () => {}, { ...INPUT, scope: s.scope() }),
    /SCOPE_REVOKED/,
  );
  assert.equal(pay.calls, 0);
  assert.ok(!s.calls.includes("settlePayment"));
});

/** /wallet tab data contract: what the page renders must come from the API scope. */
test("wallet tab: scope carries budget, tracked spend, remaining, expiry, state", () => {
  const scope = liveScope();
  assert.equal(typeof scope.dailyBudgetSats, "number");
  assert.equal(typeof scope.spentTodaySats, "number");
  assert.equal(typeof scope.expiresAt, "string");
  assert.equal(scope.state, "LOGGED_IN");
  assert.equal(remainingBudgetSats(scope), 33_333);

  // After one settled payment the remaining drops by exactly that amount.
  const paying = { ...scope, state: transitionScope(scope.state, "PAYING") };
  const settled = recordSpend(paying, 250);
  assert.equal(settled.spentTodaySats, 250);
  assert.equal(remainingBudgetSats(settled), 33_333 - 250);

  // Revoked: remaining is still computable, but checkSpend refuses (INV-4).
  const revoked = revokeScope(settled);
  assert.equal(revoked.state, "REVOKED");
  assert.equal(checkSpend(revoked, 1).allowed, false);
  assert.equal(checkSpend(revoked, 1).reason, "SCOPE_REVOKED");
});

/**
 * REGRESSION (found by the Tue live e2e, 2026-11-16): the api client sent
 * `Content-Type: application/json` with NO body on body-less POSTs
 * (explain, cancel, revoke, timeout-check) and Fastify 5 rejects that
 * with 400 FST_ERR_CTP_EMPTY_JSON_BODY. The client must send `{}`.
 */
test("api client: body-less POSTs send an empty JSON object", async () => {
  const { createServer } = await import("node:http");
  const seen: { method?: string; body: string }[] = [];
  const server = createServer((req, res) => {
    let b = "";
    req.on("data", (c: Buffer) => {
      b += c.toString();
    });
    req.on("end", () => {
      seen.push({ method: req.method, body: b });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ text: "x", source: "template" }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  process.env.NEXT_PUBLIC_API_URL = `http://127.0.0.1:${port}`;
  const { api } = await import("../apps/web/src/lib/api");
  await api.explainReceipt("rcpt_test");
  await api.cancelPayment("scope_test");
  await api.revokeScope("scope_test");
  await api.timeoutCheckDispute("disp_test");
  server.close();
  assert.equal(seen.length, 4);
  for (const s of seen) {
    assert.equal(s.method, "POST");
    assert.equal(s.body, "{}");
  }
});
