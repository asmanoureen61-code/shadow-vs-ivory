import type { EnemyKind } from "./enemies";
import type { InteractiveDef } from "./interactives";
import type { SecretDef } from "./secrets";
import type { ObjectiveDef } from "./objectives";

export type { EnemyKind };
export type { InteractiveDef, InteractiveKind } from "./interactives";
export type { SecretDef, SecretReward } from "./secrets";
export type { ObjectiveDef, ObjectiveType } from "./objectives";

export type PlatformDef = { x: number; y: number; w: number; h: number };
export type ObstacleDef = { x: number; y: number; w: number; h: number };

export type WaveEnemy = { kind: EnemyKind; x: number; /** Elite-hunt target. */ hunt?: boolean };

/** Config-driven wave: spawn pack, optional travel gate + arena lock. */
export type WaveDef = {
  enemies: WaveEnemy[];
  /** Player must reach this x (after previous wave clears) before spawn. */
  triggerX?: number;
  /** While this wave is alive, player cannot advance past lockX. */
  lockX?: number;
  /** This wave is a timed arena (uses level objective.arenaTimeSec). */
  timed?: boolean;
};

export type CheckpointDef = { x: number };

export type WeaponPickupDef = { x: number; y: number; weapon: "pistol" | "shotgun" | "smg" | "heavy" };

export type LevelDef = {
  id: number;
  name: string;
  tagline: string;
  width: number;
  platforms: PlatformDef[];
  obstacles: ObstacleDef[];
  /** Destructible / movable environment props. */
  interactives?: InteractiveDef[];
  /** Optional hidden zones — not required to finish. */
  secrets?: SecretDef[];
  /** Primary mission objective for this level. */
  objective: ObjectiveDef;
  waves: WaveDef[];
  checkpoints: CheckpointDef[];
  ammoPickups: { x: number; y: number }[];
  healthPickups: { x: number; y: number }[];
  weaponPickups?: WeaponPickupDef[];
  enemyScale: { speed: number; hp: number; damage: number; aggression: number; reaction: number };
  hint?: string;
  /** Par time for the SPEED RUNNER achievement. */
  targetTimeSec?: number;
};

export const GROUND_Y = 520;

const g = GROUND_Y;

export const LEVELS: LevelDef[] = [
  // —— Level 1: Introduction (~2× length, 14 enemies) ——
  {
    id: 1,
    name: "Sunlit Meadow",
    tagline: "Learn the basics",
    width: 4400,
    targetTimeSec: 150,
    platforms: [
      { x: 620, y: 430, w: 200, h: 24 },
      { x: 1100, y: 390, w: 220, h: 24 },
      { x: 1680, y: 420, w: 240, h: 24 },
      { x: 2300, y: 370, w: 200, h: 24 },
      { x: 2900, y: 410, w: 260, h: 24 },
      { x: 3500, y: 360, w: 220, h: 24 },
      // secret alcove (high ledge)
      { x: 3180, y: 260, w: 140, h: 24 },
    ],
    obstacles: [
      { x: 1450, y: g - 60, w: 55, h: 60 },
      { x: 2550, y: g - 70, w: 60, h: 70 },
      { x: 3200, y: g - 55, w: 70, h: 55 },
    ],
    interactives: [
      { kind: "crate", x: 980, y: g - 48 },
      { kind: "crate", x: 2100, y: g - 48 },
    ],
    secrets: [
      {
        id: "l1-alcove",
        x: 3180, y: 180, w: 140, h: 100,
        clueX: 3250, clueY: 250,
        rewards: [
          { type: "score", amount: 300 },
          { type: "ammo", amount: 8 },
          { type: "collectible", label: "Ivory Charm" },
        ],
      },
    ],
    objective: {
      type: "elimination",
      label: "Eliminate all Ivory scouts",
      bonus: { type: "secrets", count: 1, label: "Find the hidden alcove" },
    },
    waves: [
      {
        enemies: [
          { kind: "grunt", x: 780 },
          { kind: "grunt", x: 980 },
          { kind: "grunt", x: 1180 },
        ],
        lockX: 1300,
      },
      {
        enemies: [
          { kind: "grunt", x: 1700 },
          { kind: "fast", x: 1900 },
          { kind: "grunt", x: 2100 },
          { kind: "fast", x: 2250 },
        ],
        triggerX: 1550,
        lockX: 2400,
      },
      {
        enemies: [
          { kind: "grunt", x: 2800 },
          { kind: "grunt", x: 3000 },
          { kind: "fast", x: 3150 },
          { kind: "elite", x: 3400 },
        ],
        triggerX: 2650,
        lockX: 3600,
      },
      {
        enemies: [
          { kind: "grunt", x: 3900 },
          { kind: "miniboss", x: 4100 },
          { kind: "fast", x: 4000 },
        ],
        triggerX: 3750,
        lockX: 4300,
      },
    ],
    checkpoints: [{ x: 2450 }],
    ammoPickups: [
      { x: 1000, y: g - 40 },
      { x: 2700, y: g - 40 },
    ],
    healthPickups: [
      { x: 1750, y: 390 },
      { x: 3550, y: 330 },
    ],
    enemyScale: { speed: 0.65, hp: 0.65, damage: 0.6, aggression: 0.55, reaction: 0.65 },
    hint: "Arrows move & jump · Space shoot · A/S/D melee · Shift dash · F finisher (×5/×10) · Q focus · look for high ledges",
  },

  // —— Level 2: Increased Pressure (~2.3×, 18 enemies) ——
  {
    id: 2,
    name: "Hillside Orchard",
    tagline: "Brutes join the fight",
    width: 6900,
    targetTimeSec: 210,
    platforms: [
      { x: 500, y: 430, w: 180, h: 24 },
      { x: 900, y: 380, w: 200, h: 24 },
      { x: 1400, y: 340, w: 180, h: 24 },
      { x: 2000, y: 410, w: 220, h: 24 },
      { x: 2700, y: 360, w: 200, h: 24 },
      { x: 3300, y: 420, w: 240, h: 24 },
      { x: 4000, y: 350, w: 200, h: 24 },
      { x: 4700, y: 400, w: 220, h: 24 },
      { x: 5400, y: 360, w: 240, h: 24 },
      { x: 6000, y: 410, w: 200, h: 24 },
      { x: 3650, y: 250, w: 120, h: 24 },
      { x: 5600, y: 240, w: 130, h: 24 },
    ],
    obstacles: [
      { x: 1200, y: g - 70, w: 60, h: 70 },
      { x: 3800, y: g - 65, w: 90, h: 65 },
      { x: 5800, y: g - 60, w: 55, h: 60 },
    ],
    interactives: [
      { kind: "crate", x: 850, y: g - 48 },
      { kind: "barrel", x: 1600, y: g - 52 },
      { kind: "crate", x: 2450, y: g - 48 },
      { kind: "explosive", x: 3100, y: g - 50 },
      { kind: "barrel", x: 4200, y: g - 52 },
      { kind: "cover", x: 4900, y: g - 64 },
      { kind: "explosive", x: 5550, y: g - 50 },
    ],
    secrets: [
      {
        id: "l2-orchard",
        x: 3650, y: 160, w: 120, h: 110,
        clueX: 3710, clueY: 240,
        rewards: [
          { type: "health", amount: 30 },
          { type: "currency", amount: 2 },
          { type: "score", amount: 250 },
        ],
      },
      {
        id: "l2-ridge",
        x: 5600, y: 150, w: 130, h: 110,
        clueX: 5665, clueY: 230,
        rewards: [
          { type: "weapon", weapon: "shotgun" },
          { type: "ammo", amount: 6 },
          { type: "collectible", label: "Orchard Token" },
        ],
      },
    ],
    objective: {
      type: "checkpoint",
      label: "Secure the orchard · reach extract",
      extractX: 6550,
      requireWaves: 5,
      bonus: { type: "secrets", count: 2, label: "Find both orchard secrets" },
    },
    waves: [
      {
        enemies: [
          { kind: "grunt", x: 700 },
          { kind: "fast", x: 900 },
          { kind: "grunt", x: 1100 },
          { kind: "fast", x: 1250 },
        ],
        lockX: 1400,
      },
      {
        enemies: [
          { kind: "grunt", x: 1900 },
          { kind: "brute", x: 2100 },
          { kind: "fast", x: 2300 },
          { kind: "grunt", x: 2450 },
        ],
        triggerX: 1650,
        lockX: 2600,
      },
      {
        enemies: [
          { kind: "fast", x: 3100 },
          { kind: "brute", x: 3300 },
          { kind: "fast", x: 3500 },
          { kind: "grunt", x: 3650 },
          { kind: "brute", x: 3800 },
        ],
        triggerX: 2900,
        lockX: 4000,
      },
      {
        enemies: [
          { kind: "elite", x: 4600 },
          { kind: "fast", x: 4800 },
          { kind: "brute", x: 5000 },
          { kind: "grunt", x: 5150 },
        ],
        triggerX: 4350,
        lockX: 5350,
      },
      {
        enemies: [
          { kind: "miniboss", x: 6100 },
          { kind: "fast", x: 5900 },
          { kind: "brute", x: 6300 },
        ],
        triggerX: 5650,
        lockX: 6600,
      },
    ],
    checkpoints: [{ x: 4050 }],
    ammoPickups: [
      { x: 1500, y: g - 40 },
      { x: 3400, y: g - 40 },
      { x: 5200, y: g - 40 },
    ],
    healthPickups: [
      { x: 2050, y: 380 },
      { x: 4750, y: 370 },
    ],
    weaponPickups: [{ x: 2800, y: g - 40, weapon: "shotgun" }],
    enemyScale: { speed: 0.85, hp: 0.85, damage: 0.8, aggression: 0.75, reaction: 0.85 },
    hint: "Smash crates · shove barrels · orange drums explode — keep clear",
  },

  // —— Level 3: Survival & Positioning (~2.5×, 23 enemies) ——
  {
    id: 3,
    name: "Stone Terraces",
    tagline: "They will surround you",
    width: 9500,
    targetTimeSec: 260,
    platforms: [
      { x: 450, y: 430, w: 180, h: 24 },
      { x: 850, y: 360, w: 200, h: 24 },
      { x: 1400, y: 300, w: 180, h: 24 },
      { x: 2000, y: 400, w: 240, h: 24 },
      { x: 2700, y: 340, w: 200, h: 24 },
      { x: 3400, y: 420, w: 220, h: 24 },
      { x: 4100, y: 350, w: 200, h: 24 },
      { x: 4800, y: 290, w: 180, h: 24 },
      { x: 5400, y: 400, w: 240, h: 24 },
      { x: 6200, y: 360, w: 220, h: 24 },
      { x: 7000, y: 410, w: 260, h: 24 },
      { x: 7800, y: 340, w: 200, h: 24 },
      { x: 8500, y: 400, w: 220, h: 24 },
      { x: 4700, y: 200, w: 130, h: 24 },
      { x: 8300, y: 230, w: 140, h: 24 },
    ],
    obstacles: [
      { x: 1100, y: g - 80, w: 70, h: 80 },
      { x: 2400, y: g - 70, w: 90, h: 70 },
      { x: 5000, y: g - 65, w: 100, h: 65 },
      { x: 7600, y: g - 75, w: 80, h: 75 },
      { x: 8200, y: g - 60, w: 60, h: 60 },
    ],
    interactives: [
      { kind: "cover", x: 700, y: g - 64 },
      { kind: "barrel", x: 1550, y: g - 52 },
      { kind: "barrier", x: 2800, y: g - 96 },
      { kind: "crate", x: 3200, y: g - 48 },
      { kind: "explosive", x: 4000, y: g - 50 },
      { kind: "door", x: 4500, y: g - 110 },
      { kind: "barrel", x: 5800, y: g - 52 },
      { kind: "cover", x: 6400, y: g - 64 },
      { kind: "explosive", x: 7200, y: g - 50 },
      { kind: "crate", x: 8000, y: g - 48 },
    ],
    secrets: [
      {
        id: "l3-terrace",
        x: 4700, y: 110, w: 130, h: 110,
        clueX: 4765, clueY: 190,
        rewards: [
          { type: "currency", amount: 3 },
          { type: "ammo", amount: 12 },
          { type: "score", amount: 400 },
        ],
      },
      {
        id: "l3-overlook",
        x: 8300, y: 140, w: 140, h: 110,
        clueX: 8370, clueY: 220,
        rewards: [
          { type: "weapon", weapon: "smg" },
          { type: "health", amount: 35 },
          { type: "collectible", label: "Terrace Seal" },
        ],
      },
    ],
    objective: {
      type: "survival",
      label: "Survive the terrace assault",
      arenaTimeSec: 55,
      bonus: { type: "secrets", count: 2, label: "Find both terrace secrets" },
    },
    waves: [
      {
        enemies: [
          { kind: "grunt", x: 600 },
          { kind: "fast", x: 850 },
          { kind: "grunt", x: 1100 },
          { kind: "fast", x: 400 },
        ],
        lockX: 1300,
      },
      {
        enemies: [
          { kind: "brute", x: 1900 },
          { kind: "fast", x: 2100 },
          { kind: "grunt", x: 2300 },
          { kind: "fast", x: 1700 },
          { kind: "brute", x: 2500 },
        ],
        triggerX: 1550,
        lockX: 2700,
      },
      {
        enemies: [
          { kind: "fast", x: 3300 },
          { kind: "shielded", x: 3500 },
          { kind: "ranged", x: 3700 },
          { kind: "grunt", x: 3900 },
          { kind: "fast", x: 3100 },
        ],
        triggerX: 2950,
        lockX: 4200,
      },
      {
        enemies: [
          { kind: "shielded", x: 5000 },
          { kind: "ranged", x: 5200 },
          { kind: "elite", x: 5400 },
          { kind: "ranged", x: 4800 },
          { kind: "brute", x: 5600 },
        ],
        triggerX: 4550,
        lockX: 5800,
        timed: true,
      },
      {
        enemies: [
          { kind: "elite", x: 6800 },
          { kind: "ranged", x: 6600 },
          { kind: "shielded", x: 7000 },
          { kind: "fast", x: 7200 },
        ],
        triggerX: 6200,
        lockX: 7400,
      },
      {
        enemies: [
          { kind: "miniboss", x: 8600 },
          { kind: "elite", x: 8400 },
          { kind: "ranged", x: 8800 },
          { kind: "shielded", x: 8200 },
        ],
        triggerX: 7900,
        lockX: 9200,
      },
    ],
    checkpoints: [{ x: 2800 }, { x: 5900 }],
    ammoPickups: [
      { x: 1600, y: g - 40 },
      { x: 4300, y: g - 40 },
      { x: 7100, y: 380 },
    ],
    healthPickups: [
      { x: 2050, y: 370 },
      { x: 5450, y: 370 },
    ],
    weaponPickups: [{ x: 4500, y: g - 40, weapon: "smg" }],
    enemyScale: { speed: 1, hp: 1.1, damage: 1, aggression: 0.9, reaction: 1.05 },
    hint: "Shielded block punches/gun — use kick, knee, air hits, or finishers. Ranged keep distance.",
  },

  // —— Level 4: Elite Assault (~2.8×, 28 enemies) ——
  {
    id: 4,
    name: "Cloudline Ruins",
    tagline: "Waves of elites",
    width: 12320,
    targetTimeSec: 320,
    platforms: [
      { x: 400, y: 420, w: 160, h: 24 },
      { x: 800, y: 350, w: 160, h: 24 },
      { x: 1250, y: 280, w: 160, h: 24 },
      { x: 1800, y: 400, w: 200, h: 24 },
      { x: 2500, y: 330, w: 180, h: 24 },
      { x: 3200, y: 280, w: 160, h: 24 },
      { x: 3800, y: 400, w: 220, h: 24 },
      { x: 4600, y: 340, w: 200, h: 24 },
      { x: 5400, y: 290, w: 180, h: 24 },
      { x: 6100, y: 400, w: 240, h: 24 },
      { x: 7000, y: 350, w: 200, h: 24 },
      { x: 7800, y: 300, w: 180, h: 24 },
      { x: 8600, y: 400, w: 220, h: 24 },
      { x: 9400, y: 340, w: 200, h: 24 },
      { x: 10200, y: 400, w: 240, h: 24 },
      { x: 11000, y: 360, w: 200, h: 24 },
      { x: 3000, y: 200, w: 130, h: 24 },
      { x: 9000, y: 210, w: 140, h: 24 },
    ],
    obstacles: [
      { x: 1000, y: g - 90, w: 70, h: 90 },
      { x: 3500, y: g - 85, w: 70, h: 85 },
      { x: 6500, y: g - 90, w: 70, h: 90 },
      { x: 9600, y: g - 70, w: 80, h: 70 },
      { x: 10800, y: g - 85, w: 70, h: 85 },
    ],
    interactives: [
      { kind: "door", x: 1800, y: g - 110 },
      { kind: "barrel", x: 2400, y: g - 52 },
      { kind: "explosive", x: 2900, y: g - 50 },
      { kind: "barrier", x: 4200, y: g - 96 },
      { kind: "cover", x: 4800, y: g - 64 },
      { kind: "crate", x: 5600, y: g - 48 },
      { kind: "explosive", x: 6200, y: g - 50 },
      { kind: "door", x: 7400, y: g - 110 },
      { kind: "barrel", x: 8800, y: g - 52 },
      { kind: "cover", x: 10000, y: g - 64 },
      { kind: "explosive", x: 10400, y: g - 50 },
    ],
    secrets: [
      {
        id: "l4-ruins",
        x: 3000, y: 110, w: 130, h: 110,
        clueX: 3065, clueY: 190,
        rewards: [
          { type: "currency", amount: 4 },
          { type: "score", amount: 500 },
          { type: "ammo", amount: 10 },
        ],
      },
      {
        id: "l4-spire",
        x: 9000, y: 120, w: 140, h: 110,
        clueX: 9070, clueY: 200,
        rewards: [
          { type: "weapon", weapon: "heavy" },
          { type: "health", amount: 40 },
          { type: "collectible", label: "Ruin Sigil" },
        ],
      },
    ],
    objective: {
      type: "elite_hunt",
      label: "Hunt the marked Ivory elite",
      arenaTimeSec: 60,
      bonus: { type: "secrets", count: 2, label: "Find both ruin secrets" },
    },
    waves: [
      {
        enemies: [
          { kind: "dodger", x: 650 },
          { kind: "brute", x: 850 },
          { kind: "fast", x: 1050 },
          { kind: "grunt", x: 500 },
          { kind: "elite", x: 1200 },
        ],
        lockX: 1450,
      },
      {
        enemies: [
          { kind: "brute", x: 2100 },
          { kind: "elite", x: 2300 },
          { kind: "dodger", x: 2500 },
          { kind: "brute", x: 1900 },
          { kind: "dodger", x: 2700 },
        ],
        triggerX: 1700,
        lockX: 2950,
      },
      {
        enemies: [
          { kind: "elite", x: 3600, hunt: true },
          { kind: "dodger", x: 3800 },
          { kind: "shielded", x: 4000 },
          { kind: "elite", x: 3400 },
          { kind: "ranged", x: 4200 },
        ],
        triggerX: 3200,
        lockX: 4500,
      },
      {
        // survival arena
        enemies: [
          { kind: "brute", x: 5400 },
          { kind: "elite", x: 5600 },
          { kind: "dodger", x: 5800 },
          { kind: "ranged", x: 5200 },
          { kind: "shielded", x: 6000 },
          { kind: "elite", x: 6100 },
        ],
        triggerX: 4900,
        lockX: 6400,
        timed: true,
      },
      {
        enemies: [
          { kind: "elite", x: 7400 },
          { kind: "dodger", x: 7600 },
          { kind: "ranged", x: 7800 },
          { kind: "elite", x: 7200 },
          { kind: "dodger", x: 8000 },
        ],
        triggerX: 6800,
        lockX: 8400,
      },
      {
        enemies: [
          { kind: "miniboss", x: 9800 },
          { kind: "elite", x: 9500 },
          { kind: "shielded", x: 10100 },
          { kind: "dodger", x: 9300 },
          { kind: "elite", x: 10300 },
          { kind: "ranged", x: 10500 },
        ],
        triggerX: 9000,
        lockX: 11200,
      },
    ],
    checkpoints: [{ x: 3000 }, { x: 6500 }],
    ammoPickups: [
      { x: 1600, y: g - 40 },
      { x: 4600, y: g - 40 },
      { x: 8600, y: 370 },
    ],
    healthPickups: [
      { x: 2550, y: 300 },
      { x: 7050, y: 320 },
    ],
    weaponPickups: [{ x: 4800, y: g - 40, weapon: "heavy" }],
    enemyScale: { speed: 1.15, hp: 1.3, damage: 1.2, aggression: 1.05, reaction: 1.2 },
    hint: "Dodgers slip predictable swings — bait, then punish. Mix archetypes.",
  },

  // —— Level 5: Final Assault (~3×, 34 + boss) ——
  {
    id: 5,
    name: "Ivory Citadel",
    tagline: "Final stand",
    width: 15600,
    targetTimeSec: 380,
    platforms: [
      { x: 450, y: 410, w: 180, h: 24 },
      { x: 900, y: 340, w: 180, h: 24 },
      { x: 1450, y: 280, w: 160, h: 24 },
      { x: 2100, y: 400, w: 220, h: 24 },
      { x: 2900, y: 330, w: 200, h: 24 },
      { x: 3700, y: 280, w: 180, h: 24 },
      { x: 4500, y: 400, w: 240, h: 24 },
      { x: 5400, y: 340, w: 200, h: 24 },
      { x: 6200, y: 290, w: 180, h: 24 },
      { x: 7000, y: 400, w: 240, h: 24 },
      { x: 7900, y: 350, w: 200, h: 24 },
      { x: 8800, y: 300, w: 180, h: 24 },
      { x: 9700, y: 400, w: 240, h: 24 },
      { x: 10600, y: 340, w: 200, h: 24 },
      { x: 11500, y: 400, w: 260, h: 24 },
      { x: 12400, y: 350, w: 220, h: 24 },
      { x: 13400, y: 400, w: 280, h: 24 },
      { x: 14300, y: 360, w: 200, h: 24 },
      { x: 5200, y: 200, w: 130, h: 24 },
      { x: 9800, y: 210, w: 140, h: 24 },
      { x: 12900, y: 220, w: 150, h: 24 },
    ],
    obstacles: [
      { x: 1200, y: g - 90, w: 70, h: 90 },
      { x: 4000, y: g - 85, w: 70, h: 85 },
      { x: 7500, y: g - 90, w: 70, h: 90 },
      { x: 11000, y: g - 85, w: 80, h: 85 },
      { x: 14000, y: g - 90, w: 70, h: 90 },
    ],
    interactives: [
      { kind: "crate", x: 900, y: g - 48 },
      { kind: "barrel", x: 2000, y: g - 52 },
      { kind: "explosive", x: 2800, y: g - 50 },
      { kind: "door", x: 3400, y: g - 110 },
      { kind: "cover", x: 4800, y: g - 64 },
      { kind: "barrier", x: 5400, y: g - 96 },
      { kind: "explosive", x: 6800, y: g - 50 },
      { kind: "barrel", x: 8200, y: g - 52 },
      { kind: "door", x: 9000, y: g - 110 },
      { kind: "cover", x: 10200, y: g - 64 },
      { kind: "explosive", x: 11800, y: g - 50 },
      { kind: "crate", x: 13200, y: g - 48 },
      { kind: "barrel", x: 13600, y: g - 52 },
    ],
    secrets: [
      {
        id: "l5-vault-a",
        x: 5200, y: 110, w: 130, h: 110,
        clueX: 5265, clueY: 190,
        rewards: [
          { type: "currency", amount: 5 },
          { type: "ammo", amount: 14 },
          { type: "score", amount: 600 },
        ],
      },
      {
        id: "l5-vault-b",
        x: 9800, y: 120, w: 140, h: 110,
        clueX: 9870, clueY: 200,
        rewards: [
          { type: "weapon", weapon: "heavy" },
          { type: "health", amount: 45 },
          { type: "collectible", label: "Citadel Crest" },
        ],
      },
      {
        id: "l5-vault-c",
        x: 12900, y: 120, w: 150, h: 120,
        clueX: 12975, clueY: 210,
        rewards: [
          { type: "currency", amount: 6 },
          { type: "score", amount: 800 },
          { type: "collectible", label: "Warlord Relic" },
        ],
      },
    ],
    objective: {
      type: "boss",
      label: "Defeat the Ivory Warlord",
      bonus: { type: "secrets", count: 3, label: "Find all citadel secrets" },
    },
    waves: [
      {
        enemies: [
          { kind: "fast", x: 700 },
          { kind: "grunt", x: 900 },
          { kind: "brute", x: 1100 },
          { kind: "fast", x: 500 },
          { kind: "elite", x: 1300 },
        ],
        lockX: 1550,
      },
      {
        enemies: [
          { kind: "elite", x: 2300 },
          { kind: "fast", x: 2500 },
          { kind: "brute", x: 2700 },
          { kind: "fast", x: 2100 },
          { kind: "brute", x: 2900 },
        ],
        triggerX: 1850,
        lockX: 3200,
      },
      {
        enemies: [
          { kind: "elite", x: 4000 },
          { kind: "dodger", x: 4200 },
          { kind: "ranged", x: 4400 },
          { kind: "shielded", x: 3800 },
          { kind: "fast", x: 4600 },
          { kind: "grunt", x: 4700 },
        ],
        triggerX: 3500,
        lockX: 5000,
      },
      {
        enemies: [
          { kind: "brute", x: 5800 },
          { kind: "elite", x: 6000 },
          { kind: "dodger", x: 6200 },
          { kind: "ranged", x: 5600 },
          { kind: "shielded", x: 6400 },
          { kind: "brute", x: 6500 },
        ],
        triggerX: 5300,
        lockX: 6900,
      },
      {
        enemies: [
          { kind: "elite", x: 7800 },
          { kind: "dodger", x: 8000 },
          { kind: "shielded", x: 8200 },
          { kind: "ranged", x: 7600 },
          { kind: "fast", x: 8400 },
        ],
        triggerX: 7300,
        lockX: 8800,
      },
      {
        enemies: [
          { kind: "miniboss", x: 10000 },
          { kind: "elite", x: 9700 },
          { kind: "dodger", x: 10300 },
          { kind: "shielded", x: 9500 },
          { kind: "ranged", x: 10500 },
          { kind: "fast", x: 10700 },
        ],
        triggerX: 9200,
        lockX: 11200,
      },
      {
        enemies: [
          { kind: "elite", x: 12200 },
          { kind: "shielded", x: 12400 },
          { kind: "dodger", x: 12600 },
          { kind: "ranged", x: 12000 },
          { kind: "fast", x: 12800 },
        ],
        triggerX: 11600,
        lockX: 13300,
      },
      {
        enemies: [{ kind: "boss", x: 14800 }],
        triggerX: 13800,
        lockX: 15400,
      },
    ],
    checkpoints: [{ x: 3300 }, { x: 7000 }, { x: 11300 }],
    ammoPickups: [
      { x: 1700, y: g - 40 },
      { x: 5100, y: g - 40 },
      { x: 8900, y: g - 40 },
      { x: 13000, y: g - 40 },
    ],
    healthPickups: [
      { x: 2950, y: 300 },
      { x: 7050, y: 370 },
      { x: 13500, y: 370 },
    ],
    enemyScale: { speed: 1.3, hp: 1.55, damage: 1.35, aggression: 1.25, reaction: 1.35 },
  },
];
