/** Config-driven Ivory archetypes — behaviour/costume only. */

export type EnemyKind =
  | "grunt"
  | "fast"
  | "brute"
  | "shielded"
  | "elite"
  | "ranged"
  | "dodger"
  | "miniboss"
  | "boss";

export type EnemyDef = {
  id: EnemyKind;
  name: string;
  hp: number;
  speed: number;
  dmg: number;
  w: number;
  h: number;
  score: number;
  knockRes: number;
  meleeRange: number;
  attackFrames: number;
  attackCd: number;
  /** Multiplier on dodge reaction chance. */
  dodgeMul: number;
  shieldHp?: number;
  /** Preferred engagement band for kiting (ranged). */
  preferMin?: number;
  preferMax?: number;
  fireCd?: number;
  shotDmg?: number;
  shotSpeed?: number;
  shotRange?: number;
};

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  grunt: {
    id: "grunt",
    name: "Grunt",
    hp: 45,
    speed: 1.65,
    dmg: 6,
    w: 38,
    h: 88,
    score: 100,
    knockRes: 1,
    meleeRange: 46,
    attackFrames: 20,
    attackCd: 70,
    dodgeMul: 1,
  },
  fast: {
    id: "fast",
    name: "Fast",
    hp: 28,
    speed: 2.55,
    dmg: 5,
    w: 34,
    h: 80,
    score: 120,
    knockRes: 1.15,
    meleeRange: 44,
    attackFrames: 14,
    attackCd: 42,
    dodgeMul: 1.6,
  },
  /** Heavy archetype — high HP, slow, strong. */
  brute: {
    id: "brute",
    name: "Heavy",
    hp: 110,
    speed: 1.25,
    dmg: 12,
    w: 48,
    h: 100,
    score: 220,
    knockRes: 0.35,
    meleeRange: 52,
    attackFrames: 22,
    attackCd: 78,
    dodgeMul: 0.45,
  },
  shielded: {
    id: "shielded",
    name: "Shielded",
    hp: 70,
    speed: 1.35,
    dmg: 8,
    w: 42,
    h: 92,
    score: 200,
    knockRes: 0.55,
    meleeRange: 48,
    attackFrames: 20,
    attackCd: 68,
    dodgeMul: 0.7,
    shieldHp: 55,
  },
  elite: {
    id: "elite",
    name: "Elite",
    hp: 150,
    speed: 2.15,
    dmg: 13,
    w: 42,
    h: 94,
    score: 360,
    knockRes: 0.7,
    meleeRange: 50,
    attackFrames: 18,
    attackCd: 55,
    dodgeMul: 1.85,
  },
  ranged: {
    id: "ranged",
    name: "Ranged",
    hp: 40,
    speed: 1.75,
    dmg: 5,
    w: 36,
    h: 86,
    score: 160,
    knockRes: 1.05,
    meleeRange: 42,
    attackFrames: 16,
    attackCd: 60,
    dodgeMul: 1.1,
    preferMin: 170,
    preferMax: 290,
    fireCd: 55,
    shotDmg: 7,
    shotSpeed: 7.5,
    shotRange: 70,
  },
  dodger: {
    id: "dodger",
    name: "Dodger",
    hp: 48,
    speed: 2.35,
    dmg: 7,
    w: 36,
    h: 84,
    score: 180,
    knockRes: 1.2,
    meleeRange: 46,
    attackFrames: 15,
    attackCd: 48,
    dodgeMul: 2.8,
  },
  miniboss: {
    id: "miniboss",
    name: "Commander",
    hp: 320,
    speed: 1.85,
    dmg: 15,
    w: 52,
    h: 112,
    score: 800,
    knockRes: 0.3,
    meleeRange: 62,
    attackFrames: 20,
    attackCd: 58,
    dodgeMul: 1.2,
  },
  boss: {
    id: "boss",
    name: "Warlord",
    hp: 1100,
    speed: 2.05,
    dmg: 18,
    w: 62,
    h: 130,
    score: 2500,
    knockRes: 0.22,
    meleeRange: 78,
    attackFrames: 20,
    attackCd: 50,
    dodgeMul: 1.35,
  },
};
