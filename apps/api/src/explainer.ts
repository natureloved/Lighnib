/**
 * explainer.ts — AI receipt explainer with template fallback (no LLM key needed).
 *
 * The LLM path is used only when LLM_API_URL + LLM_API_KEY are set.
 * Otherwise the template fallback explains the receipt in 2 sentences,
 * Pidgin + English — offline, deterministic, always available.
 * The explainer never receives a secret, a private key, or wallet data:
 * only the public bound receipt.
 */

import { receiptSummary, type BoundReceipt } from "@lighnib/shared";

export interface ExplainerResult {
  text: string;
  source: "llm" | "template";
  language: "Pidgin/English";
}

export function templateExplain(
  receipt: BoundReceipt,
  currencySymbol: string,
): ExplainerResult {
  const summary = receiptSummary(receipt, currencySymbol);
  const text =
    `${summary} ` +
    `Dis receipt na proof say the money reach ${receipt.vendorName} for ${receipt.purpose} — ` +
    `if wahala come, the market association mediator go see this same receipt and settle am.`;
  return { text, source: "template", language: "Pidgin/English" };
}

export async function explainReceipt(
  receipt: BoundReceipt,
  currencySymbol: string,
): Promise<ExplainerResult> {
  const url = process.env.LLM_API_URL;
  const key = process.env.LLM_API_KEY;
  if (!url || !key) return templateExplain(receipt, currencySymbol);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: process.env.LLM_MODEL ?? "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Explain a Lightning payment receipt in 2 short sentences, " +
              "mixing Nigerian Pidgin and simple English, for a Lagos market trader. " +
              "Mention amount, vendor, purpose, and that the receipt is proof.",
          },
          { role: "user", content: receiptSummary(receipt, currencySymbol) },
        ],
        max_tokens: 150,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return templateExplain(receipt, currencySymbol);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return templateExplain(receipt, currencySymbol);
    return { text, source: "llm", language: "Pidgin/English" };
  } catch {
    return templateExplain(receipt, currencySymbol);
  }
}
