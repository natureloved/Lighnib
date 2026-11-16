/**
 * Conversion tests — NGN/XOF ↔ sats + mempool.space fee context.
 * Conversion always takes the BTC price as an explicit input;
 * the package never pretends to know a live price.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  feeContext,
  ngnToSats,
  satsToNgn,
  satsToXof,
  xofToSats,
} from "../packages/shared/src/index";

const DEMO_BTC_NGN = 150_000_000; // demo placeholder rate (see config/locale.ts)

test("NGN → sats at the demo rate", () => {
  // ₦50,000 at ₦150,000,000/BTC = 33,333 sats.
  assert.equal(ngnToSats(50_000, DEMO_BTC_NGN), 33_333);
  // ₦70,000 (the demo over-budget invoice) = 46,667 sats.
  assert.equal(ngnToSats(70_000, DEMO_BTC_NGN), 46_667);
  assert.equal(ngnToSats(0, DEMO_BTC_NGN), 0);
});

test("sats → NGN round-trips within rounding", () => {
  const sats = ngnToSats(50_000, DEMO_BTC_NGN);
  const back = satsToNgn(sats, DEMO_BTC_NGN);
  assert.ok(Math.abs(back - 50_000) <= 5, `round-trip off by ${back - 50_000}`);
});

test("XOF conversion uses its own rate", () => {
  const btcXof = 90_000_000;
  assert.equal(xofToSats(45_000, btcXof), 50_000);
  assert.equal(satsToXof(50_000, btcXof), 45_000);
});

test("conversion rejects bad inputs", () => {
  assert.throws(() => ngnToSats(-1, DEMO_BTC_NGN), /must not be negative/);
  assert.throws(() => ngnToSats(100, 0), /must be positive/);
  assert.throws(() => satsToNgn(-5, DEMO_BTC_NGN), /must not be negative/);
  assert.throws(() => xofToSats(100, -1), /must be positive/);
});

test("fee context is display-only and labelled", () => {
  const ctx = feeContext(12);
  assert.equal(ctx.fastestFeeSatPerVbyte, 12);
  assert.equal(ctx.estimatedTxFeeSats, 12 * 140);
  assert.equal(ctx.source, "mempool.space");
  assert.match(ctx.note, /Lightning/);
});
