import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { Game } from "@/game/engine";

type Props = {
  gameRef: RefObject<Game | null>;
  enabled: boolean;
  specialReady?: boolean;
  focusActive?: boolean;
  finisherReady?: boolean;
  finisherTier?: 0 | 1 | 2;
};

type HoldAction = "left" | "right" | "up" | "shift" | "fire";
type TapAction = "punch" | "kick" | "knee" | "dodge" | "special" | "nextWeapon" | "finisher";

/**
 * On-screen D-pad + action pads for touch devices.
 * Updates the engine shared input map via game.setHeld / game.tap — no React input state per frame.
 */
export default function MobileControls({
  gameRef,
  enabled,
  specialReady = false,
  focusActive = false,
  finisherReady = false,
  finisherTier = 0,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  /** pointerId → hold action (supports multi-touch) */
  const holds = useRef<Map<number, HoldAction>>(new Map());

  useEffect(() => {
    if (!enabled) {
      holds.current.clear();
      gameRef.current?.clearHeld();
    }
  }, [enabled, gameRef]);

  useEffect(() => {
    return () => {
      holds.current.clear();
      gameRef.current?.clearHeld();
    };
  }, [gameRef]);

  if (!enabled) return null;

  const setActive = (el: HTMLElement | null, on: boolean) => {
    if (!el) return;
    if (on) el.dataset["active"] = "1";
    else delete el.dataset["active"];
  };

  const bindHold = (action: HoldAction) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.currentTarget;
      btn.setPointerCapture(e.pointerId);
      holds.current.set(e.pointerId, action);
      setActive(btn, true);
      gameRef.current?.setHeld(action, true);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      releaseHold(e.pointerId, e.currentTarget);
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLButtonElement>) => {
      releaseHold(e.pointerId, e.currentTarget);
    },
    onLostPointerCapture: (e: ReactPointerEvent<HTMLButtonElement>) => {
      releaseHold(e.pointerId, e.currentTarget);
    },
  });

  const releaseHold = (pointerId: number, el: HTMLElement) => {
    const action = holds.current.get(pointerId);
    if (!action) {
      setActive(el, false);
      return;
    }
    holds.current.delete(pointerId);
    setActive(el, false);
    // Only release engine hold if no other pointer still holds the same action
    let still = false;
    for (const a of holds.current.values()) {
      if (a === action) { still = true; break; }
    }
    if (!still) gameRef.current?.setHeld(action, false);
  };

  const bindTap = (action: TapAction) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const btn = e.currentTarget;
      btn.setPointerCapture(e.pointerId);
      setActive(btn, true);
      if (action === "dodge") {
        // Mirror keyboard Shift: dash once + hold sprint while pressed
        gameRef.current?.setHeld("shift", true);
      } else {
        gameRef.current?.tap(action);
      }
    },
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setActive(e.currentTarget, false);
      if (action === "dodge") gameRef.current?.setHeld("shift", false);
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLButtonElement>) => {
      setActive(e.currentTarget, false);
      if (action === "dodge") gameRef.current?.setHeld("shift", false);
    },
  });

  return (
    <div
      ref={rootRef}
      className="mobile-controls"
      aria-label="Touch controls"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="mobile-pad mobile-pad--move">
        <button type="button" className="mc-btn mc-btn--dir mc-up" aria-label="Jump" {...bindHold("up")}>
          ↑
        </button>
        <div className="mc-move-row">
          <button type="button" className="mc-btn mc-btn--dir" aria-label="Move left" {...bindHold("left")}>
            ←
          </button>
          <button type="button" className="mc-btn mc-btn--dir" aria-label="Move right" {...bindHold("right")}>
            →
          </button>
        </div>
      </div>

      <div className="mobile-pad mobile-pad--actions">
        <button type="button" className="mc-btn mc-btn--action mc-fire" aria-label="Fire" {...bindHold("fire")}>
          FIRE
        </button>
        <button type="button" className="mc-btn mc-btn--action" aria-label="Punch" {...bindTap("punch")}>
          PUNCH
        </button>
        <button type="button" className="mc-btn mc-btn--action" aria-label="Kick" {...bindTap("kick")}>
          KICK
        </button>
        <button type="button" className="mc-btn mc-btn--action" aria-label="Knee" {...bindTap("knee")}>
          KNEE
        </button>
        <button type="button" className="mc-btn mc-btn--dodge" aria-label="Dodge" {...bindTap("dodge")}>
          DODGE
        </button>
        <button type="button" className="mc-btn mc-btn--weapon" aria-label="Switch weapon" {...bindTap("nextWeapon")}>
          WEAPON
        </button>
        {finisherReady && (
          <button
            type="button"
            className={`mc-btn mc-btn--finisher${finisherTier >= 2 ? " ult" : ""}`}
            aria-label={finisherTier >= 2 ? "Ultimate finisher" : "Finisher"}
            {...bindTap("finisher")}
          >
            {finisherTier >= 2 ? "ULT" : "FINISH"}
          </button>
        )}
        <button
          type="button"
          className={`mc-btn mc-btn--special${specialReady ? " ready" : ""}${focusActive ? " focus" : ""}`}
          aria-label="Special Focus"
          aria-disabled={!specialReady}
          {...bindTap("special")}
        >
          {focusActive ? "FOCUS" : "SPECIAL"}
        </button>
      </div>
    </div>
  );
}
