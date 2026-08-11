/** Lightweight, persistent achievement system. */

export type AchievementId =
  | "noDamage"
  | "combo10"
  | "meleeOnly"
  | "speedRunner"
  | "bossSlayer"
  | "secretHunter";

export type AchievementDef = {
  id: AchievementId;
  name: string;
  description: string;
};

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "noDamage", name: "No Damage", description: "Complete a level without taking damage." },
  { id: "combo10", name: "10x Combo", description: "Reach a ×10 combo." },
  { id: "meleeOnly", name: "Melee Only", description: "Complete a level without firing a weapon." },
  { id: "speedRunner", name: "Speed Runner", description: "Finish a level under its target time." },
  { id: "bossSlayer", name: "Boss Slayer", description: "Defeat the final boss." },
  { id: "secretHunter", name: "Secret Hunter", description: "Discover all secrets in a level." },
];

export const ACHIEVEMENTS_STORE = "shadow-vs-ivory-achievements";

export function readUnlocked(): Record<AchievementId, boolean> {
  const empty: Record<AchievementId, boolean> = {
    noDamage: false,
    combo10: false,
    meleeOnly: false,
    speedRunner: false,
    bossSlayer: false,
    secretHunter: false,
  };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(ACHIEVEMENTS_STORE);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<Record<AchievementId, boolean>>;
    for (const def of ACHIEVEMENTS) empty[def.id] = !!parsed[def.id];
    return empty;
  } catch {
    return empty;
  }
}

/** Unlock an achievement. Returns true only the first time it is unlocked. */
export function unlockAchievement(id: AchievementId): boolean {
  if (typeof window === "undefined") return false;
  const unlocked = readUnlocked();
  if (unlocked[id]) return false;
  unlocked[id] = true;
  window.localStorage.setItem(ACHIEVEMENTS_STORE, JSON.stringify(unlocked));
  return true;
}
