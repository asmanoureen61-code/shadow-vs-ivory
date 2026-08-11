/** Persistent character upgrades — lightweight, localStorage-backed. */

import { addCurrency, readCurrency, spendCurrency } from "./secrets";

export type UpgradeId =
  | "maxHealth"
  | "ammoCapacity"
  | "meleeDamage"
  | "reloadSpeed"
  | "dodgeCooldown"
  | "comboDuration"
  | "specialGain";

export type UpgradeDef = {
  id: UpgradeId;
  name: string;
  blurb: string;
  /** Cost per rank (index 0 = buying rank 1). */
  costs: number[];
};

export const UPGRADES: UpgradeDef[] = [
  {
    id: "maxHealth",
    name: "Max Health",
    blurb: "+12 HP per rank",
    costs: [2, 4, 6, 9],
  },
  {
    id: "ammoCapacity",
    name: "Ammo Capacity",
    blurb: "+12% mag & reserve per rank",
    costs: [2, 4, 6, 9],
  },
  {
    id: "meleeDamage",
    name: "Melee Damage",
    blurb: "+12% fist damage per rank",
    costs: [2, 4, 7, 10],
  },
  {
    id: "reloadSpeed",
    name: "Reload Speed",
    blurb: "−8% reload time per rank",
    costs: [2, 3, 5, 8],
  },
  {
    id: "dodgeCooldown",
    name: "Dodge Cooldown",
    blurb: "−4 frames CD per rank",
    costs: [2, 4, 6, 9],
  },
  {
    id: "comboDuration",
    name: "Combo Duration",
    blurb: "+12 frames window per rank",
    costs: [2, 3, 5, 8],
  },
  {
    id: "specialGain",
    name: "Special Gain",
    blurb: "+10% Focus fill per rank",
    costs: [2, 4, 6, 9],
  },
];

export const UPGRADE_STORE = "shadow-vs-ivory-upgrades";

export type UpgradeLevels = Record<UpgradeId, number>;

export type UpgradeMods = {
  bonusHp: number;
  ammoMul: number;
  meleeMul: number;
  reloadMul: number;
  dodgeCd: number;
  comboExtra: number;
  specialMul: number;
};

const ZERO_LEVELS: UpgradeLevels = {
  maxHealth: 0,
  ammoCapacity: 0,
  meleeDamage: 0,
  reloadSpeed: 0,
  dodgeCooldown: 0,
  comboDuration: 0,
  specialGain: 0,
};

export function maxRank(def: UpgradeDef): number {
  return def.costs.length;
}

export function readUpgradeLevels(): UpgradeLevels {
  if (typeof window === "undefined") return { ...ZERO_LEVELS };
  try {
    const raw = window.localStorage.getItem(UPGRADE_STORE);
    if (!raw) return { ...ZERO_LEVELS };
    const parsed = JSON.parse(raw) as Partial<UpgradeLevels>;
    const out = { ...ZERO_LEVELS };
    for (const def of UPGRADES) {
      const n = Number(parsed[def.id] ?? 0);
      out[def.id] = Number.isFinite(n) ? Math.max(0, Math.min(maxRank(def), Math.floor(n))) : 0;
    }
    return out;
  } catch {
    return { ...ZERO_LEVELS };
  }
}

export function writeUpgradeLevels(levels: UpgradeLevels) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(UPGRADE_STORE, JSON.stringify(levels));
}

export function getUpgradeMods(levels = readUpgradeLevels()): UpgradeMods {
  return {
    bonusHp: levels.maxHealth * 12,
    ammoMul: 1 + levels.ammoCapacity * 0.12,
    meleeMul: 1 + levels.meleeDamage * 0.12,
    reloadMul: Math.max(0.6, 1 - levels.reloadSpeed * 0.08),
    dodgeCd: Math.max(22, 45 - levels.dodgeCooldown * 4),
    comboExtra: levels.comboDuration * 12,
    specialMul: 1 + levels.specialGain * 0.1,
  };
}

export function costForNext(id: UpgradeId, levels = readUpgradeLevels()): number | null {
  const def = UPGRADES.find((u) => u.id === id);
  if (!def) return null;
  const rank = levels[id] ?? 0;
  if (rank >= maxRank(def)) return null;
  return def.costs[rank] ?? null;
}

/** Buy one rank. Returns false if maxed or can't afford. */
export function buyUpgrade(id: UpgradeId): boolean {
  const levels = readUpgradeLevels();
  const cost = costForNext(id, levels);
  if (cost == null) return false;
  if (!spendCurrency(cost)) return false;
  levels[id] = (levels[id] ?? 0) + 1;
  writeUpgradeLevels(levels);
  return true;
}

/** Soft clear reward so upgrades stay reachable without grinding secrets. */
export function awardClearCurrency(rank: "S" | "A" | "B" | "C"): number {
  const amount = 3 + (rank === "S" ? 3 : rank === "A" ? 2 : rank === "B" ? 1 : 0);
  addCurrency(amount);
  return amount;
}

export { readCurrency };
