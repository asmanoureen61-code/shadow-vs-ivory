export type PlatformDef = { x: number; y: number; w: number; h: number };
export type ObstacleDef = { x: number; y: number; w: number; h: number };
export type EnemyKind = "grunt" | "brute" | "elite" | "boss";

export type WaveDef = { kind: EnemyKind; x: number }[];

export type LevelDef = {
  id: number;
  name: string;
  tagline: string;
  width: number;
  platforms: PlatformDef[];
  obstacles: ObstacleDef[];
  waves: WaveDef[];
  ammoPickups: { x: number; y: number }[];
  healthPickups: { x: number; y: number }[];
  enemyScale: { speed: number; hp: number; damage: number; aggression: number; reaction: number };
  hint?: string;
};

export const GROUND_Y = 520;

export const LEVELS: LevelDef[] = [
  {
    id: 1,
    name: "Sunlit Meadow",
    tagline: "Learn the basics",
    width: 2200,
    platforms: [
      { x: 700, y: 420, w: 220, h: 24 },
      { x: 1300, y: 380, w: 260, h: 24 },
    ],
    obstacles: [],
    waves: [[{ kind: "grunt", x: 900 }, { kind: "grunt", x: 1500 }, { kind: "grunt", x: 1900 }]],
    ammoPickups: [{ x: 1100, y: GROUND_Y - 40 }],
    healthPickups: [{ x: 1700, y: GROUND_Y - 40 }],
    enemyScale: { speed: 0.6, hp: 0.6, damage: 0.6, aggression: 0.5, reaction: 0.6 },
    hint: "Arrows to move & jump · Space to shoot · A punch · S kick · D knee · Shift dash",
  },
  {
    id: 2,
    name: "Hillside Orchard",
    tagline: "Brutes join the fight",
    width: 3000,
    platforms: [
      { x: 620, y: 430, w: 200, h: 24 },
      { x: 1150, y: 380, w: 240, h: 24 },
      { x: 1900, y: 420, w: 220, h: 24 },
    ],
    obstacles: [{ x: 1600, y: GROUND_Y - 70, w: 60, h: 70 }],
    waves: [
      [{ kind: "grunt", x: 800 }, { kind: "grunt", x: 1200 }, { kind: "brute", x: 1800 }],
      [{ kind: "grunt", x: 2300 }, { kind: "brute", x: 2700 }],
    ],
    ammoPickups: [{ x: 1000, y: GROUND_Y - 40 }, { x: 2200, y: GROUND_Y - 40 }],
    healthPickups: [{ x: 1950, y: 390 }],
    enemyScale: { speed: 0.85, hp: 0.85, damage: 0.8, aggression: 0.7, reaction: 0.8 },
  },
  {
    id: 3,
    name: "Stone Terraces",
    tagline: "They will surround you",
    width: 3800,
    platforms: [
      { x: 500, y: 430, w: 200, h: 24 },
      { x: 1000, y: 360, w: 220, h: 24 },
      { x: 1700, y: 420, w: 260, h: 24 },
      { x: 2500, y: 370, w: 240, h: 24 },
    ],
    obstacles: [
      { x: 1350, y: GROUND_Y - 80, w: 70, h: 80 },
      { x: 2200, y: GROUND_Y - 60, w: 90, h: 60 },
      { x: 3100, y: GROUND_Y - 80, w: 70, h: 80 },
    ],
    waves: [
      [{ kind: "grunt", x: 700 }, { kind: "brute", x: 1200 }, { kind: "grunt", x: 400 }],
      [{ kind: "brute", x: 2000 }, { kind: "brute", x: 2600 }, { kind: "grunt", x: 2400 }],
      [{ kind: "elite", x: 3300 }, { kind: "grunt", x: 3000 }],
    ],
    ammoPickups: [{ x: 900, y: GROUND_Y - 40 }, { x: 2000, y: GROUND_Y - 40 }, { x: 3000, y: GROUND_Y - 40 }],
    healthPickups: [{ x: 1750, y: 390 }],
    enemyScale: { speed: 1, hp: 1.1, damage: 1, aggression: 0.85, reaction: 1 },
  },
  {
    id: 4,
    name: "Cloudline Ruins",
    tagline: "Waves of elites",
    width: 4400,
    platforms: [
      { x: 450, y: 420, w: 180, h: 24 },
      { x: 900, y: 350, w: 180, h: 24 },
      { x: 1400, y: 290, w: 180, h: 24 },
      { x: 2000, y: 400, w: 220, h: 24 },
      { x: 2700, y: 330, w: 200, h: 24 },
      { x: 3400, y: 400, w: 240, h: 24 },
    ],
    obstacles: [
      { x: 1200, y: GROUND_Y - 90, w: 70, h: 90 },
      { x: 2400, y: GROUND_Y - 70, w: 90, h: 70 },
      { x: 3200, y: GROUND_Y - 90, w: 70, h: 90 },
    ],
    waves: [
      [{ kind: "brute", x: 800 }, { kind: "grunt", x: 1100 }, { kind: "brute", x: 1500 }],
      [{ kind: "elite", x: 2200 }, { kind: "brute", x: 2500 }, { kind: "grunt", x: 2000 }],
      [{ kind: "elite", x: 3300 }, { kind: "elite", x: 3800 }, { kind: "brute", x: 4100 }],
    ],
    ammoPickups: [{ x: 1000, y: GROUND_Y - 40 }, { x: 2600, y: GROUND_Y - 40 }, { x: 3800, y: GROUND_Y - 40 }],
    healthPickups: [{ x: 2050, y: 370 }],
    enemyScale: { speed: 1.2, hp: 1.35, damage: 1.25, aggression: 1, reaction: 1.2 },
  },
  {
    id: 5,
    name: "Ivory Citadel",
    tagline: "Final stand",
    width: 5200,
    platforms: [
      { x: 500, y: 410, w: 200, h: 24 },
      { x: 1050, y: 340, w: 200, h: 24 },
      { x: 1700, y: 400, w: 220, h: 24 },
      { x: 2400, y: 320, w: 220, h: 24 },
      { x: 3100, y: 400, w: 240, h: 24 },
      { x: 3900, y: 340, w: 240, h: 24 },
    ],
    obstacles: [
      { x: 1450, y: GROUND_Y - 90, w: 70, h: 90 },
      { x: 2900, y: GROUND_Y - 70, w: 90, h: 70 },
      { x: 3600, y: GROUND_Y - 90, w: 70, h: 90 },
    ],
    waves: [
      [{ kind: "brute", x: 800 }, { kind: "elite", x: 1300 }, { kind: "grunt", x: 1000 }],
      [{ kind: "elite", x: 2200 }, { kind: "elite", x: 2600 }, { kind: "brute", x: 2900 }],
      [{ kind: "elite", x: 3600 }, { kind: "elite", x: 3900 }, { kind: "brute", x: 4100 }],
      [{ kind: "boss", x: 4800 }],
    ],
    ammoPickups: [
      { x: 1100, y: GROUND_Y - 40 },
      { x: 2500, y: GROUND_Y - 40 },
      { x: 3500, y: GROUND_Y - 40 },
      { x: 4400, y: GROUND_Y - 40 },
    ],
    healthPickups: [{ x: 3150, y: 370 }, { x: 4300, y: GROUND_Y - 40 }],
    enemyScale: { speed: 1.35, hp: 1.6, damage: 1.4, aggression: 1.2, reaction: 1.4 },
  },
];
