/**
 * Lighnib API, Fastify.
 *
 * Holds NO funds. Never sees the NWC secret (all NWC calls happen
 * client-side in the browser). Validates scope / INV-9 bindings /
 * bound receipts / disputes from public data only.
 *
 * INV-8 guard: any request body containing a secret key is rejected
 * with 400 before any handler runs.
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import {
  LOCALE,
  containsForbiddenSecretKey,
  ngnToSats,
  satsToNgn,
  xofToSats,
  feeContext,
  type BoundReceipt,
} from "@lighnib/shared";
import { NWC_INFO, validateScopeRequest } from "./nwc";
import {
  beginPayment,
  cancelPayment,
  checkScopeSpend,
  createScopeRecord,
  getScope,
  listScopes,
  revokeScopeRecord,
  settlePayment,
} from "./scope";
import {
  checkBinding,
  createReceipt,
  decodeInvoice,
  getMetrics,
  getReceipt,
  listBlocked,
  listReceipts,
  recordBlocked,
  recordBinding,
  verifyPastedReceipt,
  verifyReceiptById,
} from "./receipts";
import {
  getDispute,
  listDisputes,
  openDisputeForReceipt,
  releaseDispute,
  reviewDispute,
  timeoutCheckDispute,
} from "./disputes";
import { explainReceipt, templateExplain } from "./explainer";
import { VOICE_CONFIG, speakPlan } from "./voice";

const app = Fastify({ logger: true });
app.register(cors, { origin: true });

/** INV-8: reject any request that carries an NWC secret (or any secret key). */
app.addHook("preHandler", async (request, reply) => {
  if (request.body && containsForbiddenSecretKey(request.body)) {
    reply.code(400).send({
      error:
        "INV-8: the NWC secret must NEVER be sent to the API. " +
        "NWC calls happen client-side in the browser only.",
    });
  }
});

app.get("/health", async () => ({
  ok: true,
  service: "lighnib-api",
  version: "0.1.0",
  holdsFunds: false,
  seesNwcSecret: false,
}));

/* --- NWC info (public capabilities only) --- */
app.get("/api/nwc/info", async () => NWC_INFO);

/* --- Scope (INV-1, INV-2, INV-4) --- */
app.post("/api/scope/login", async (request, reply) => {
  try {
    const input = validateScopeRequest(request.body);
    return createScopeRecord(input);
  } catch (err) {
    reply.code(400).send({ error: (err as Error).message });
  }
});
app.get("/api/scope/:id", async (request, reply) => {
  const scope = getScope((request.params as { id: string }).id);
  if (!scope) return reply.code(404).send({ error: "Unknown scope" });
  return scope;
});
app.get("/api/scope", async () => listScopes());
app.post("/api/scope/:id/check", async (request) => {
  const { id } = request.params as { id: string };
  const { amountSats } = request.body as { amountSats: number };
  return checkScopeSpend(id, amountSats);
});
app.post("/api/scope/:id/begin-payment", async (request, reply) => {
  try {
    const { id } = request.params as { id: string };
    const { amountSats } = request.body as { amountSats: number };
    return beginPayment(id, amountSats);
  } catch (err) {
    reply.code(400).send({ error: (err as Error).message });
  }
});
app.post("/api/scope/:id/settle-payment", async (request, reply) => {
  try {
    const { id } = request.params as { id: string };
    const { amountSats } = request.body as { amountSats: number };
    return settlePayment(id, amountSats);
  } catch (err) {
    reply.code(400).send({ error: (err as Error).message });
  }
});
app.post("/api/scope/:id/cancel-payment", async (request, reply) => {
  try {
    const { id } = request.params as { id: string };
    return cancelPayment(id);
  } catch (err) {
    reply.code(400).send({ error: (err as Error).message });
  }
});
app.post("/api/scope/:id/revoke", async (request, reply) => {
  try {
    const { id } = request.params as { id: string };
    return revokeScopeRecord(id);
  } catch (err) {
    reply.code(400).send({ error: (err as Error).message });
  }
});

/* --- Invoices / INV-9 --- */
app.post("/api/invoices", async (request, reply) => {
  try {
    return recordBinding(request.body as Parameters<typeof recordBinding>[0]);
  } catch (err) {
    reply.code(400).send({ error: (err as Error).message });
  }
});
app.post("/api/invoices/check", async (request) => {
  const { paymentHash, supplierId, amountSats } = request.body as {
    paymentHash: string;
    supplierId?: string;
    amountSats?: number;
  };
  return checkBinding(paymentHash, supplierId, amountSats);
});
app.post("/api/invoices/decode", async (request) => {
  const { invoice } = request.body as { invoice: string };
  return decodeInvoice(invoice);
});

/* --- Bound receipts (INV-5, INV-6) --- */
app.post("/api/receipts", async (request, reply) => {
  try {
    return createReceipt(request.body as Parameters<typeof createReceipt>[0]);
  } catch (err) {
    reply.code(400).send({ error: (err as Error).message });
  }
});
app.get("/api/receipts", async () => listReceipts());
app.get("/api/receipts/:id", async (request, reply) => {
  const receipt = getReceipt((request.params as { id: string }).id);
  if (!receipt) return reply.code(404).send({ error: "Unknown receipt" });
  return receipt;
});
app.get("/api/receipts/:id/verify", async (request) => {
  return verifyReceiptById((request.params as { id: string }).id);
});
app.post("/api/receipts/verify-pasted", async (request) => {
  return verifyPastedReceipt(request.body);
});

/* --- Blocked attempts + metrics (Wed fix, Tasks 2 + 6) --- */
app.post("/api/blocked", async (request, reply) => {
  try {
    return recordBlocked(request.body as Parameters<typeof recordBlocked>[0]);
  } catch (err) {
    reply.code(400).send({ error: (err as Error).message });
  }
});
app.get("/api/blocked", async () => listBlocked());
app.get("/api/metrics", async () => getMetrics());

/* --- Disputes (INV-7, hold window) --- */
app.post("/api/disputes", async (request, reply) => {
  try {
    return openDisputeForReceipt(
      request.body as { receiptId: string; buyerPubkey: string },
    );
  } catch (err) {
    reply.code(400).send({ error: (err as Error).message });
  }
});
app.get("/api/disputes", async () => listDisputes());
app.get("/api/disputes/:id", async (request, reply) => {
  const dispute = getDispute((request.params as { id: string }).id);
  if (!dispute) return reply.code(404).send({ error: "Unknown dispute" });
  return dispute;
});
app.post("/api/disputes/:id/review", async (request, reply) => {
  try {
    return reviewDispute((request.params as { id: string }).id);
  } catch (err) {
    reply.code(400).send({ error: (err as Error).message });
  }
});
app.post("/api/disputes/:id/release", async (request, reply) => {
  try {
    const { mediator, to } = request.body as { mediator: string; to: "buyer" | "supplier" };
    return releaseDispute((request.params as { id: string }).id, { mediator, to });
  } catch (err) {
    reply.code(400).send({ error: (err as Error).message });
  }
});
app.post("/api/disputes/:id/timeout-check", async (request, reply) => {
  try {
    const timedOut = timeoutCheckDispute((request.params as { id: string }).id);
    return timedOut ?? getDispute((request.params as { id: string }).id);
  } catch (err) {
    reply.code(400).send({ error: (err as Error).message });
  }
});

/* --- AI explainer + voice --- */
app.post("/api/explainer/:receiptId", async (request, reply) => {
  const receipt: BoundReceipt | undefined = getReceipt(
    (request.params as { receiptId: string }).receiptId,
  );
  if (!receipt) return reply.code(404).send({ error: "Unknown receipt" });
  return explainReceipt(receipt, LOCALE.currencySymbol);
});
app.post("/api/explainer", async (request) => {
  const receipt = request.body as BoundReceipt;
  return templateExplain(receipt, LOCALE.currencySymbol);
});
app.get("/api/voice", async () => VOICE_CONFIG);
app.post("/api/voice/speak-plan", async (request) => {
  const { text } = request.body as { text: string };
  return speakPlan(text);
});

/* --- Conversion (rate passed in, the API knows no live price) --- */
app.get("/api/convert", async (request) => {
  const q = request.query as Record<string, string>;
  const btcPrice = Number(q.btcPrice ?? LOCALE.demoBtcPriceNgn);
  const currency = (q.currency ?? LOCALE.currency) as "NGN" | "XOF";
  if (q.ngn) {
    return { fiat: Number(q.ngn), currency, sats: ngnToSats(Number(q.ngn), btcPrice) };
  }
  if (q.xof) {
    return { fiat: Number(q.xof), currency, sats: xofToSats(Number(q.xof), btcPrice) };
  }
  if (q.sats) {
    const sats = Number(q.sats);
    return {
      sats,
      currency,
      fiat: currency === "XOF" ? sats : satsToNgn(sats, btcPrice),
    };
  }
  return { error: "Pass ?ngn=, ?xof= or ?sats= with ?btcPrice=" };
});
app.get("/api/fees", async () => {
  try {
    const res = await fetch("https://mempool.space/api/v1/fees/recommended", {
      signal: AbortSignal.timeout(5_000),
    });
    const data = (await res.json()) as { fastestFee: number };
    return feeContext(data.fastestFee);
  } catch {
    return { error: "mempool.space unreachable", source: "mempool.space" };
  }
});

const port = Number(process.env.API_PORT ?? 3001);
const host = process.env.API_HOST ?? "0.0.0.0";
app.ready().then(
  async () => {
    try {
      await app.listen({ port, host });
      app.log.info(
        `lighnib-api listening on ${host}:${port}, holds NO funds, never sees the NWC secret`,
      );
    } catch (err) {
      app.log.error(err);
      process.exit(1);
    }
  },
  (err: Error) => {
    app.log.error(err);
    process.exit(1);
  },
);
