/** Reusable interactive environment props — config only. */

export type InteractiveKind = "crate" | "barrel" | "barrier" | "explosive" | "cover" | "door";

export type InteractiveDef = {
  kind: InteractiveKind;
  /** Left edge. */
  x: number;
  /** Top edge (same convention as obstacles). */
  y: number;
};

export type InteractiveStats = {
  w: number;
  h: number;
  hp: number;
  /** Can be shoved by attacks / player contact. */
  movable: boolean;
  explosive: boolean;
  score: number;
  knockMul: number;
};

export const INTERACTIVE_STATS: Record<InteractiveKind, InteractiveStats> = {
  crate: {
    w: 48,
    h: 48,
    hp: 28,
    movable: false,
    explosive: false,
    score: 40,
    knockMul: 0,
  },
  barrel: {
    w: 40,
    h: 52,
    hp: 36,
    movable: true,
    explosive: false,
    score: 55,
    knockMul: 1.15,
  },
  barrier: {
    w: 36,
    h: 96,
    hp: 90,
    movable: false,
    explosive: false,
    score: 100,
    knockMul: 0,
  },
  explosive: {
    w: 44,
    h: 50,
    hp: 22,
    movable: true,
    explosive: true,
    score: 80,
    knockMul: 1,
  },
  cover: {
    w: 56,
    h: 64,
    hp: 50,
    movable: false,
    explosive: false,
    score: 65,
    knockMul: 0,
  },
  door: {
    w: 28,
    h: 110,
    hp: 70,
    movable: false,
    explosive: false,
    score: 120,
    knockMul: 0,
  },
};
