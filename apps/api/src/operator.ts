/**
 * operator.ts, operator-key gate for privileged API routes.
 *
 * POST /api/invoices writes the INV-9 supplier-binding registry, and
 * that registry is the ONLY supplier enforcement Lighnib has (the wallet
 * enforces budget only, never the supplier). An open binding route lets
 * anyone register any hash under any supplier, which makes the check
 * worthless. So binding creation is operator-only: the caller must send
 * the LIGHNIB_OPERATOR_KEY in the x-operator-key header.
 *
 * The key is an operator secret, not a user credential. It lives in
 * seed/.demo-credentials.json (mode 600, gitignored) on the machine and
 * in the operator's shell locally; it is never committed, never logged,
 * and never sent to the browser. Rotate it if it ever leaks.
 */

/** Result of an operator-key check, so the route can answer correctly. */
export type OperatorKeyCheck = "ok" | "not-configured" | "unauthorized";

export function checkOperatorKey(
  headers: Record<string, string | string[] | undefined>,
  configuredKey: string | undefined,
): OperatorKeyCheck {
  if (!configuredKey) return "not-configured";
  const presented = headers["x-operator-key"];
  if (typeof presented !== "string" || presented !== configuredKey) {
    return "unauthorized";
  }
  return "ok";
}
