/** Config-driven mission objectives. */

export type ObjectiveType =
  | "elimination"
  | "survival"
  | "checkpoint"
  | "elite_hunt"
  | "timed_arena"
  | "boss";

export type ObjectiveDef = {
  type: ObjectiveType;
  /** Short HUD title. */
  label: string;
  /** Optional extract / reach zone (checkpoint objectives). */
  extractX?: number;
  /** Waves that must be cleared before extract counts (checkpoint). */
  requireWaves?: number;
  /** Timed-arena duration in seconds (applies to waves with timed: true). */
  arenaTimeSec?: number;
  /** Optional bonus challenge (does not block clear). */
  bonus?: {
    type: "secrets";
    count: number;
    label: string;
  };
};

export function defaultObjectiveLabel(type: ObjectiveType): string {
  switch (type) {
    case "elimination": return "Eliminate all Ivory forces";
    case "survival": return "Survive the assault waves";
    case "checkpoint": return "Reach the extract zone";
    case "elite_hunt": return "Hunt the marked elite";
    case "timed_arena": return "Clear the arena in time";
    case "boss": return "Defeat the Warlord";
  }
}
