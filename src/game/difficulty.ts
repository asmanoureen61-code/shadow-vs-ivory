/** Difficulty modes — configuration multipliers only, no duplicated game logic. */

export type Difficulty = "easy" | "normal" | "hard";

export const DIFFICULTY_STORE = "shadow-vs-ivory-difficulty";
export const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];

export type DifficultyMods = {
  /** Multiplies the level's base enemyScale fields. */
  enemyScaleMul: { speed: number; hp: number; damage: number; aggression: number; reaction: number };
  /** Extra frames added/removed from each side of the perfect-dodge window. */
  dodgeWindowPad: number;
  /** Effectiveness of health pickups/rewards. */
  healMul: number;
  /** Effectiveness of ammo pickups/rewards. */
  ammoMul: number;
};

const MODS: Record<Difficulty, DifficultyMods> = {
  easy: {
    enemyScaleMul: { speed: 0.94, hp: 0.92, damage: 0.8, aggression: 0.85, reaction: 0.85 },
    dodgeWindowPad: 2,
    healMul: 1.35,
    ammoMul: 1.3,
  },
  normal: {
    enemyScaleMul: { speed: 1, hp: 1, damage: 1, aggression: 1, reaction: 1 },
    dodgeWindowPad: 0,
    healMul: 1,
    ammoMul: 1,
  },
  hard: {
    enemyScaleMul: { speed: 1.06, hp: 1.1, damage: 1.18, aggression: 1.18, reaction: 1.18 },
    dodgeWindowPad: -1,
    healMul: 0.8,
    ammoMul: 0.8,
  },
};

export function readDifficulty(): Difficulty {
  if (typeof window === "undefined") return "normal";
  const raw = window.localStorage.getItem(DIFFICULTY_STORE);
  return raw === "easy" || raw === "hard" ? raw : "normal";
}

export function writeDifficulty(d: Difficulty) {
  if (typeof window !== "undefined") window.localStorage.setItem(DIFFICULTY_STORE, d);
}

export function getDifficultyMods(d: Difficulty = readDifficulty()): DifficultyMods {
  return MODS[d];
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "Easy",
  normal: "Normal",
  hard: "Hard",
};
