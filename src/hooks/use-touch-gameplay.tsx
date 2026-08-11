import { useEffect, useState } from "react";

/** True when primary interaction is touch/coarse (not fine-pointer desktop). */
export function useTouchGameplay() {
  const [showTouchControls, setShowTouchControls] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const touchMq = window.matchMedia("(hover: none), (pointer: coarse)");
    const portraitMq = window.matchMedia("(orientation: portrait)");

    const sync = () => {
      const touch = touchMq.matches || (navigator.maxTouchPoints > 0 && window.matchMedia("(hover: none)").matches);
      setShowTouchControls(touch);
      setIsPortrait(touch && portraitMq.matches);
    };

    sync();
    touchMq.addEventListener("change", sync);
    portraitMq.addEventListener("change", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      touchMq.removeEventListener("change", sync);
      portraitMq.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  return { showTouchControls, isPortrait };
}
