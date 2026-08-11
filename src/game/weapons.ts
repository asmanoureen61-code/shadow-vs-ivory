export type WeaponId = "pistol" | "shotgun" | "smg" | "heavy";

export type WeaponDef = {
  id: WeaponId;
  name: string;
  damage: number;
  /** Frames between shots. */
  fireRate: number;
  magSize: number;
  maxReserve: number;
  reloadTime: number;
  /** Max aim jitter in radians for each pellet. */
  spread: number;
  pellets: number;
  bulletSpeed: number;
  /** Bullet lifetime in frames (range proxy). */
  range: number;
  knock: number;
  auto: boolean;
  color: string;
};

export const WEAPON_ORDER: WeaponId[] = ["pistol", "shotgun", "smg", "heavy"];

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: "pistol",
    name: "Pistol",
    damage: 22,
    fireRate: 11,
    magSize: 12,
    maxReserve: 48,
    reloadTime: 70,
    spread: 0.02,
    pellets: 1,
    bulletSpeed: 15,
    range: 90,
    knock: 4,
    auto: false,
    color: "#ffd76a",
  },
  shotgun: {
    id: "shotgun",
    name: "Shotgun",
    damage: 11,
    fireRate: 28,
    magSize: 4,
    maxReserve: 16,
    reloadTime: 95,
    spread: 0.22,
    pellets: 5,
    bulletSpeed: 13,
    range: 42,
    knock: 6,
    auto: false,
    color: "#ffb35c",
  },
  smg: {
    id: "smg",
    name: "SMG",
    damage: 9,
    fireRate: 5,
    magSize: 24,
    maxReserve: 72,
    reloadTime: 80,
    spread: 0.08,
    pellets: 1,
    bulletSpeed: 16,
    range: 75,
    knock: 3,
    auto: true,
    color: "#9ad9ff",
  },
  heavy: {
    id: "heavy",
    name: "Heavy",
    damage: 55,
    fireRate: 42,
    magSize: 1,
    maxReserve: 4,
    reloadTime: 110,
    spread: 0.01,
    pellets: 1,
    bulletSpeed: 12,
    range: 100,
    knock: 10,
    auto: false,
    color: "#ff8a5c",
  },
};

export type WeaponLoadout = {
  unlocked: boolean;
  mag: number;
  reserve: number;
};

export function createLoadout(levelId: number, ammoMul = 1): Record<WeaponId, WeaponLoadout> {
  const mul = Math.max(1, ammoMul);
  const mag = (id: WeaponId) => Math.max(1, Math.round(WEAPONS[id].magSize * mul));
  const res = (id: WeaponId, base: number) => Math.max(0, Math.round(base * mul));
  const shotgunOn = levelId >= 2;
  const smgOn = levelId >= 3;
  const heavyOn = levelId >= 4;
  return {
    pistol: { unlocked: true, mag: mag("pistol"), reserve: res("pistol", WEAPONS.pistol.maxReserve) },
    shotgun: {
      unlocked: shotgunOn,
      mag: shotgunOn ? mag("shotgun") : 0,
      reserve: shotgunOn ? res("shotgun", 8) : 0,
    },
    smg: {
      unlocked: smgOn,
      mag: smgOn ? mag("smg") : 0,
      reserve: smgOn ? res("smg", 24) : 0,
    },
    heavy: {
      unlocked: heavyOn,
      mag: heavyOn ? mag("heavy") : 0,
      reserve: heavyOn ? res("heavy", 2) : 0,
    },
  };
}
