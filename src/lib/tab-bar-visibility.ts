import { useEffect, useSyncExternalStore } from "react";

// Tiny global store for tab bar visibility. Components can call
// useHideTabBar() in an effect to hide the bottom tab bar while mounted.
// The TabBar component subscribes via useTabBarHidden().

let hiddenCount = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return hiddenCount > 0;
}

export function useTabBarHidden(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Hide the tab bar while the calling component is mounted. */
export function useHideTabBar(active: boolean = true) {
  useEffect(() => {
    if (!active) return;
    hiddenCount += 1;
    emit();
    return () => {
      hiddenCount -= 1;
      emit();
    };
  }, [active]);
}
