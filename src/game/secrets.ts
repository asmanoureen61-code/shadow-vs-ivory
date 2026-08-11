/** Optional secret zones — never required for level clear. */

export type SecretReward =
  | { type: "score"; amount: number }
  | { type: "ammo"; amount: number }
  | { type: "health"; amount: number }
  | { type: "weapon"; weapon: "pistol" | "shotgun" | "smg" | "heavy" }
  | { type: "currency"; amount: number }
  | { type: "collectible"; label?: string };

export type SecretDef = {
  id: string;
  /** Discovery trigger rect (world space, top-left). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Subtle environmental clue marker. */
  clueX: number;
  clueY: number;
  rewards: SecretReward[];
};

export const CURRENCY_STORE = "shadow-vs-ivory-currency";

export function readCurrency(): number {
  if (typeof window === "undefined") return 0;
  const n = Number(window.localStorage.getItem(CURRENCY_STORE) ?? "0");
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export function addCurrency(amount: number) {
  if (typeof window === "undefined" || amount <= 0) return readCurrency();
  const next = readCurrency() + amount;
  window.localStorage.setItem(CURRENCY_STORE, String(next));
  return next;
}

/** Spend currency if affordable. Returns false when balance is too low. */
export function spendCurrency(amount: number): boolean {
  if (typeof window === "undefined" || amount <= 0) return amount <= 0;
  const cur = readCurrency();
  if (cur < amount) return false;
  window.localStorage.setItem(CURRENCY_STORE, String(cur - amount));
  return true;
}
