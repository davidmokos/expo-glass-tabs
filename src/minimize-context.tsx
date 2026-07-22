import { createContext, use, useMemo, type PropsWithChildren } from 'react';
import {
  useAnimatedScrollHandler,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * Spring, not timing: scroll direction flips mid-animation constantly, and a
 * spring retargets while preserving velocity — a timing curve would restart
 * from zero and feel mechanical. Critically damped (ratio 1): no overshoot
 * and no long settling tail, which matters because the bar animates layout.
 */
export const MINIMIZE_SPRING = { duration: 380, dampingRatio: 1 };

export type MinimizeState = {
  /** 0 = expanded (icons + labels), 1 = minimized (icons only). */
  progress: SharedValue<number>;
  /** Last requested target — lets writers avoid restarting the spring. */
  target: SharedValue<number>;
};

const MinimizeContext = createContext<MinimizeState | null>(null);

export function TabBarMinimizeProvider({ children }: PropsWithChildren) {
  const progress = useSharedValue(0);
  const target = useSharedValue(0);
  const state = useMemo(() => ({ progress, target }), [progress, target]);
  return <MinimizeContext.Provider value={state}>{children}</MinimizeContext.Provider>;
}

/** Full minimize state — used by the bar and the scroll hook. */
export function useMinimizeState(): MinimizeState {
  const shared = use(MinimizeContext);
  // Local fallback keeps screens working when rendered outside the provider
  // (e.g. a web tab layout with no floating bar).
  const progress = useSharedValue(0);
  const target = useSharedValue(0);
  const local = useMemo(() => ({ progress, target }), [progress, target]);
  return shared ?? local;
}

/** The animated 0..1 minimize progress (what styles interpolate on). */
export function useTabBarMinimized(): SharedValue<number> {
  return useMinimizeState().progress;
}

/**
 * Retarget the minimize spring — no-op when already heading to `next`, so
 * per-frame scroll events never restart (and visibly stutter) the animation.
 * Callable from both threads.
 */
export function setMinimized(state: MinimizeState, next: 0 | 1) {
  'worklet';
  if (state.target.value !== next) {
    state.target.value = next;
    state.progress.value = withSpring(next, MINIMIZE_SPRING);
  }
}

/**
 * Scroll handler for Animated.ScrollView. Scrolling down minimizes the tab
 * bar, scrolling up (or being near the top) expands it. Offsets are clamped
 * to the scrollable range so rubber-band overscroll can't flip the direction
 * for a frame and flicker the bar.
 */
export function useMinimizeOnScroll() {
  const state = useMinimizeState();
  const previousY = useSharedValue(0);

  return useAnimatedScrollHandler({
    onScroll: (event) => {
      const maxY = Math.max(event.contentSize.height - event.layoutMeasurement.height, 0);
      const y = Math.min(Math.max(event.contentOffset.y, 0), maxY);
      const dy = y - previousY.value;
      previousY.value = y;

      if (y < 24) {
        setMinimized(state, 0);
      } else if (dy > 3) {
        setMinimized(state, 1);
      } else if (dy < -3) {
        setMinimized(state, 0);
      }
    },
  });
}
