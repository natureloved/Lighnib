/**
 * Wednesday tests, bound-receipt polish (verify-by-paste), AI explainer
 * LLM path (stub server) + fallback, TTS labelling, dispute cut.
 * LLM note: no real LLM key exists in this environment, so the LLM path
 * is verified against a local stub OpenAI-compatible server, that proves
 * our client code (request shape, response parse, failure fallback),
 * not a real provider. The real-provider path stays untested; record it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  buildBoundReceipt,
  hexToBytes,
  sha256Hex,
  verifyReceipt,
  verifyReceiptDetail,
} from "../packages/shared/src/index";
import { verifyPastedReceipt } from "../apps/api/src/receipts";
import { explainReceipt, templateExplain } from "../apps/api/src/explainer";
import { speak, speechSupported, stopSpeaking, VOICE_LABEL } from "../apps/web/src/lib/voice";
import { speakPlan, VOICE_CONFIG } from "../apps/api/src/voice";

const PREIMAGE = "ab".repeat(32);
const PAYMENT_HASH = sha256Hex(hexToBytes(PREIMAGE));

function receiptInput(overrides: Record<string, unknown> = {}) {
  return {
    id: "rcpt_wed_1",
    orderId: "ORD-WED-1",
    supplierId: "supplier-balogun-001",
    vendorName: "Balogun provisions, Mama Nkechi",
    purpose: "2 bags of rice",
    amountSats: 100,
    amountFiat: 5000,
    currency: "NGN" as const,
    paymentHash: PAYMENT_HASH,
    preimage: PREIMAGE,
    payerPubkey: "c".repeat(64),
    ...overrides,
  };
}

test("verifyReceiptDetail: valid receipt passes every check", () => {
  const r = buildBoundReceipt(receiptInput());
  const d = verifyReceiptDetail(r);
  assert.equal(d.valid, true);
  assert.equal(d.settled, true);
  assert.equal(d.complete, true);
  assert.equal(d.hashFormat, true);
  assert.equal(d.preimageFormat, true);
  assert.equal(d.preimageMatchesHash, true);
  assert.equal(d.nostrEventMatches, true);
  assert.equal(verifyReceipt(r), true);
});

test("verifyReceiptDetail: tampered amount fails the Nostr cross-check only", () => {
  const r = buildBoundReceipt(receiptInput());
  const tampered = { ...r, amountSats: 999_999 };
  const d = verifyReceiptDetail(tampered);
  assert.equal(d.valid, false);
  assert.equal(d.preimageMatchesHash, true);
  assert.equal(d.nostrEventMatches, false);
  assert.equal(verifyReceipt(tampered), false);
});

test("verifyReceiptDetail: wrong preimage fails the hash check", () => {
  const r = buildBoundReceipt(receiptInput());
  const tampered = { ...r, preimage: "cd".repeat(32) };
  const d = verifyReceiptDetail(tampered);
  assert.equal(d.valid, false);
  assert.equal(d.preimageMatchesHash, false);
  assert.equal(d.nostrEventMatches, false);
});

test("verifyReceiptDetail: non-settled receipt fails the settled check", () => {
  const r = buildBoundReceipt(receiptInput());
  // "PENDING" is not a legal BoundReceipt status, cast to test the check.
  const notSettled = { ...r, status: "PENDING" } as unknown as typeof r;
  const d = verifyReceiptDetail(notSettled);
  assert.equal(d.valid, false);
  assert.equal(d.settled, false);
  assert.equal(d.preimageMatchesHash, true);
});

test("verifyPastedReceipt: pasted receipt JSON verifies without stored state", () => {
  const r = buildBoundReceipt(receiptInput());
  const res = verifyPastedReceipt(JSON.parse(JSON.stringify(r)));
  assert.equal(res.valid, true);
  assert.equal(res.checks?.preimageMatchesHash, true);
  assert.equal(res.checks?.nostrEventMatches, true);
});

test("verifyPastedReceipt: tampered pasted receipt fails", () => {
  const r = buildBoundReceipt(receiptInput());
  const tampered = { ...r, vendorName: "Somebody else" };
  const res = verifyPastedReceipt(tampered);
  assert.equal(res.valid, false);
  assert.equal(res.checks?.nostrEventMatches, false);
});

test("verifyPastedReceipt: malformed input fails with a reason, never throws", () => {
  for (const bad of [null, undefined, "not json", 42, [], { id: "x" }]) {
    const res = verifyPastedReceipt(bad);
    assert.equal(res.valid, false);
    assert.ok(res.reason);
    assert.equal(res.checks, null);
  }
});

/** Tiny OpenAI-compatible stub, for the LLM path only. */
function stubLlmServer(mode: "ok" | "error500"): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        if (mode === "error500") {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "boom" }));
          return;
        }
        const parsed = JSON.parse(body) as { model?: string; messages?: unknown[] };
        assert.ok(parsed.model);
        assert.ok(Array.isArray(parsed.messages) && parsed.messages.length >= 2);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    "You pay ₦5,000 to Balogun provisions for 2 bags of rice. Dis receipt na proof, mediator go see am if wahala come.",
                },
              },
            ],
          }),
        );
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      resolve({ url: `http://127.0.0.1:${addr.port}/v1/chat/completions`, close: () => server.close() });
    });
  });
}

test("explainer: LLM path returns source=llm via a stub provider", async () => {
  const stub = await stubLlmServer("ok");
  const prev = { url: process.env.LLM_API_URL, key: process.env.LLM_API_KEY, model: process.env.LLM_MODEL };
  process.env.LLM_API_URL = stub.url;
  process.env.LLM_API_KEY = "stub-key";
  process.env.LLM_MODEL = "stub-model";
  try {
    const r = buildBoundReceipt(receiptInput());
    const out = await explainReceipt(r, "₦");
    assert.equal(out.source, "llm");
    assert.match(out.text, /Balogun provisions/);
    assert.match(out.text, /proof/);
  } finally {
    if (prev.url === undefined) delete process.env.LLM_API_URL;
    else process.env.LLM_API_URL = prev.url;
    if (prev.key === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = prev.key;
    if (prev.model === undefined) delete process.env.LLM_MODEL;
    else process.env.LLM_MODEL = prev.model;
    stub.close();
  }
});

test("explainer: LLM 500 falls back to the template, never throws", async () => {
  const stub = await stubLlmServer("error500");
  process.env.LLM_API_URL = stub.url;
  process.env.LLM_API_KEY = "stub-key";
  try {
    const r = buildBoundReceipt(receiptInput());
    const out = await explainReceipt(r, "₦");
    assert.equal(out.source, "template");
    assert.match(out.text, /Balogun provisions/);
  } finally {
    delete process.env.LLM_API_URL;
    delete process.env.LLM_API_KEY;
    stub.close();
  }
});

test("explainer: no LLM env → template fallback (the live demo path)", async () => {
  delete process.env.LLM_API_URL;
  delete process.env.LLM_API_KEY;
  const r = buildBoundReceipt(receiptInput());
  const out = await explainReceipt(r, "₦");
  assert.equal(out.source, "template");
  assert.equal(out.language, "Pidgin/English");
  assert.equal(templateExplain(r, "₦").source, "template");
});

test("voice: honest label, no dedicated Pidgin voice, English voice reads Pidgin", () => {
  assert.match(VOICE_LABEL, /No dedicated Pidgin voice/);
  assert.match(VOICE_LABEL, /English voice reading Pidgin/);
  assert.equal(VOICE_CONFIG.label, VOICE_LABEL);
  assert.equal(VOICE_CONFIG.lang, "en-NG");
  const plan = speakPlan("You pay ₦5,000.");
  assert.equal(plan.lang, "en-NG");
  assert.equal(plan.label, VOICE_LABEL);
  assert.equal(plan.text, "You pay ₦5,000.");
});

test("voice: no speechSynthesis in Node → speak() returns false, stop never throws", () => {
  assert.equal(speechSupported(), false);
  assert.equal(speak("hello"), false);
  stopSpeaking();
});
