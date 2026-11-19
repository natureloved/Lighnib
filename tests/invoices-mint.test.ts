/**
 * Invoice mint tests, POST /api/invoices/mint logic (invoices.ts).
 * The endpoint mints in the supplier's LNbits wallet AND records the
 * INV-9 binding in one call. Tests use a fake LNbits caller, so no
 * live node is needed; one test spins up a local HTTP server to prove
 * the real LNbits caller sends the right request.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  createLnbitsMintFn,
  isHashBound,
  MAX_MINT_SATS,
  mintInvoice,
  mintedOrderCount,
  MINTABLE_SUPPLIERS,
  type LnbitsInvoice,
  type MintRequest,
} from "../apps/api/src/invoices";
import { bindings } from "../apps/api/src/receipts";

function fakeMint(invoice: LnbitsInvoice, calls: { n: number }) {
  return async (_args: { amountSats: number; memo: string }) => {
    calls.n += 1;
    return invoice;
  };
}

const SUPPLIER = "supplier-balogun-001";
const HASH =
  "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899";
const REQUEST = "lnbc100n1fakeinvoice";

test("mint returns the invoice and records the INV-9 binding", async () => {
  const calls = { n: 0 };
  const result = await mintInvoice(
    { supplierId: SUPPLIER, orderId: "ORD-MINT-1", amountSats: 100 },
    fakeMint({ payment_request: REQUEST, payment_hash: HASH }, calls),
  );
  assert.equal(result.paymentRequest, REQUEST);
  assert.equal(result.paymentHash, HASH);
  assert.equal(result.supplierId, SUPPLIER);
  assert.equal(result.supplierName, MINTABLE_SUPPLIERS[SUPPLIER]);
  assert.equal(result.orderId, "ORD-MINT-1");
  assert.equal(result.amountSats, 100);
  assert.equal(result.memo, "Lighnib:order#ORD-MINT-1:supplier-balogun-001");
  assert.equal(calls.n, 1);
  assert.equal(isHashBound(HASH), true);
  const binding = bindings.get(HASH);
  assert.equal(binding?.supplierId, SUPPLIER);
  assert.equal(binding?.orderId, "ORD-MINT-1");
  assert.equal(binding?.amountSats, 100);
  // The minted invoice passes the pre-payment check the merchant flow runs.
  assert.equal(bindings.check(HASH, SUPPLIER, 100).allowed, true);
  assert.equal(bindings.check(HASH, "supplier-002", 100).allowed, false);
});

test("mint refuses the demo-block supplier and unknown suppliers", async () => {
  const calls = { n: 0 };
  const mint = fakeMint(
    { payment_request: REQUEST, payment_hash: HASH },
    calls,
  );
  await assert.rejects(
    mintInvoice(
      { supplierId: "supplier-999", orderId: "ORD-MINT-2", amountSats: 100 },
      mint,
    ),
    /Unknown or unmintable supplier/,
  );
  await assert.rejects(
    mintInvoice(
      { supplierId: "supplier-nope", orderId: "ORD-MINT-3", amountSats: 100 },
      mint,
    ),
    /Unknown or unmintable supplier/,
  );
  assert.equal(calls.n, 0);
});

test("mint rejects bad amounts", async () => {
  const calls = { n: 0 };
  const mint = fakeMint(
    { payment_request: REQUEST, payment_hash: HASH },
    calls,
  );
  const bad: unknown[] = [0, -5, 1.5, Number.NaN, MAX_MINT_SATS + 1, "100"];
  for (const amountSats of bad) {
    await assert.rejects(
      mintInvoice(
        {
          supplierId: SUPPLIER,
          orderId: "ORD-MINT-BAD",
          amountSats: amountSats as number,
        } as MintRequest,
        mint,
      ),
      /amountSats must be an integer/,
    );
  }
  assert.equal(calls.n, 0);
});

test("mint rejects bad order ids", async () => {
  const calls = { n: 0 };
  const mint = fakeMint(
    { payment_request: REQUEST, payment_hash: HASH },
    calls,
  );
  for (const orderId of ["", "ORD #1", "ORD/1", "x".repeat(65)]) {
    await assert.rejects(
      mintInvoice({ supplierId: SUPPLIER, orderId, amountSats: 100 }, mint),
      /orderId must be/,
    );
  }
  assert.equal(calls.n, 0);
});

test("mint is idempotent per orderId, and a changed re-mint is refused", async () => {
  const calls = { n: 0 };
  const mint = fakeMint(
    {
      payment_request: "lnbc200n1idem",
      payment_hash:
        "11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff",
    },
    calls,
  );
  const first = await mintInvoice(
    { supplierId: SUPPLIER, orderId: "ORD-MINT-IDEM", amountSats: 200 },
    mint,
  );
  const second = await mintInvoice(
    { supplierId: SUPPLIER, orderId: "ORD-MINT-IDEM", amountSats: 200 },
    mint,
  );
  assert.deepEqual(second, first);
  assert.equal(calls.n, 1);
  assert.equal(mintedOrderCount() >= 1, true);
  await assert.rejects(
    mintInvoice(
      { supplierId: SUPPLIER, orderId: "ORD-MINT-IDEM", amountSats: 201 },
      mint,
    ),
    /already minted with different/,
  );
  assert.equal(calls.n, 1);
});

test("an LNbits failure mints nothing and binds nothing", async () => {
  const failing = async () => {
    throw new Error("LNbits mint failed: HTTP 500");
  };
  await assert.rejects(
    mintInvoice(
      { supplierId: SUPPLIER, orderId: "ORD-MINT-FAIL", amountSats: 100 },
      failing,
    ),
    /LNbits mint failed/,
  );
  assert.equal(
    isHashBound(
      "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    ),
    false,
  );
});

test("the real LNbits caller posts the right request", async () => {
  const seen: { method?: string; url?: string; apiKey?: string; body?: string } =
    {};
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      seen.method = req.method;
      seen.url = req.url;
      seen.apiKey = req.headers["x-api-key"] as string;
      seen.body = body;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          payment_request: "lnbc300n1real",
          payment_hash:
            "998877665544332211009988776655443322110099887766554433221100",
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;
  try {
    const mint = createLnbitsMintFn(
      `http://127.0.0.1:${port}`,
      "test-invoice-key",
    );
    const out = await mint({
      amountSats: 300,
      memo: "Lighnib:order#ORD-MINT-HTTP:supplier-balogun-001",
    });
    assert.equal(out.payment_request, "lnbc300n1real");
    assert.equal(seen.method, "POST");
    assert.equal(seen.url, "/api/v1/payments");
    assert.equal(seen.apiKey, "test-invoice-key");
    assert.deepEqual(JSON.parse(seen.body ?? "{}"), {
      out: false,
      amount: 300,
      memo: "Lighnib:order#ORD-MINT-HTTP:supplier-balogun-001",
    });
  } finally {
    server.close();
  }
});

test("the real LNbits caller throws on a non-200", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ detail: "Invalid API key" }));
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;
  try {
    const mint = createLnbitsMintFn(`http://127.0.0.1:${port}`, "bad-key");
    await assert.rejects(
      mint({ amountSats: 100, memo: "Lighnib:order#X:supplier-balogun-001" }),
      /HTTP 401/,
    );
  } finally {
    server.close();
  }
});
