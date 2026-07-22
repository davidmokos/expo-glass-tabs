import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { SymbolView, SymbolViewProps } from 'expo-symbols';
import {
  Children,
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TabListProps, TabTriggerSlotProps } from 'expo-router/ui';

import { MINIMIZE_SPRING, setMinimized, useMinimizeState } from './minimize-context';
import { ProgressiveBlur } from './progressive-blur';

const AnimatedGlassView = Animated.createAnimatedComponent(GlassView);

const EXPANDED_HEIGHT = 58;
const MINIMIZED_HEIGHT = 44;
/** Extra horizontal inset applied to the pill when minimized (per side). */
const MINIMIZED_INSET = 34;
/** Outer margin between the pill and the screen edges (per side). */
const BAR_MARGIN = 12;
/** Inner inset between the capsule wall and the tab items. */
const ROW_PAD_H = 4;
const LABEL_HEIGHT = 13;
const ICON_SIZE = 21;
/** Space between icon and label — folded into the label's animated height so
 * it fully disappears when minimized (keeps the icon perfectly centered). */
const ITEM_GAP = 2;
const LABEL_BLOCK = LABEL_HEIGHT + ITEM_GAP;
const ITEM_PAD_V = 7;
/** Highlight content heights — radius must track h/2 for a true capsule. */
const HIGHLIGHT_EXPANDED = ICON_SIZE + LABEL_BLOCK + ITEM_PAD_V * 2;
const HIGHLIGHT_MINIMIZED = ICON_SIZE + ITEM_PAD_V * 2;
/** How far the bottom progressive blur bleeds above the pill. */
const BLUR_BLEED = 44;

/**
 * Slide spring: interruptible by design — rapid tab-hopping retargets with
 * preserved velocity. Slight under-damping gives the pill a tiny settle,
 * safe here because it's transform-only (no layout involved).
 */
const SLIDE_SPRING = { duration: 420, dampingRatio: 0.82 };

export type GlassTabBarTheme = {
  activeTint: string;
  inactiveTint: string;
  /** Sliding highlight pill color. */
  highlight: string;
  /** Dark tint layered over the liquid glass. */
  glassTint: string;
  /** Opaque-ish background used when liquid glass is unavailable. */
  solidFallback: string;
};

const DEFAULT_THEME: GlassTabBarTheme = {
  activeTint: '#FFFFFF',
  inactiveTint: '#9E9EA6',
  highlight: 'rgba(255,255,255,0.14)',
  glassTint: 'rgba(10,10,12,0.55)',
  solidFallback: 'rgba(18,18,20,0.94)',
};

export type GlassTabItem = {
  name: string;
  label: string;
  /** SF Symbol name (preferred). */
  icon?: SymbolViewProps['name'];
  /** Custom glyph (e.g. a tinted logo image); called once per tint layer. */
  renderIcon?: (props: { tint: string; size: number }) => ReactNode;
};

type BarContextValue = {
  slideIndex: SharedValue<number>;
  isDragging: SharedValue<boolean>;
  theme: GlassTabBarTheme;
};

const BarContext = createContext<BarContextValue | null>(null);

export type GlassTabBarProps = TabListProps & {
  /** Called when a tab is chosen by tap or scrub release. */
  onIndexSelected?: (index: number) => void;
  theme?: Partial<GlassTabBarTheme>;
  /** Haptic tick while the scrub crosses tab boundaries (iOS). */
  haptics?: boolean;
};

/**
 * Floating liquid-glass tab bar with Revolut-style minimize-on-scroll,
 * a sliding highlight, and finger scrubbing. Use via `TabList asChild`
 * with expo-router's headless tabs.
 */
export function GlassTabBar({
  children,
  onIndexSelected,
  theme: themeOverrides,
  haptics = true,
  ...props
}: GlassTabBarProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const minimized = useMinimizeState();
  const progress = minimized.progress;
  const slideIndex = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const lastTicked = useSharedValue(-1);
  const tabCount = Math.max(Children.count(children), 1);
  const theme = useMemo(() => ({ ...DEFAULT_THEME, ...themeOverrides }), [themeOverrides]);

  // Picker-style tick while the highlight crosses tab boundaries mid-drag.
  const tick = useCallback(() => {
    if (haptics && Platform.OS === 'ios') {
      Haptics.selectionAsync();
    }
  }, [haptics]);

  // Navigation happens only on release — switching screens live while
  // scrubbing makes the content jump under the finger.
  const selectIndex = useCallback((index: number) => onIndexSelected?.(index), [onIndexSelected]);

  // Scrubbing: the highlight tracks the finger 1:1 while dragging (no spring
  // — it must feel attached), haptic ticks fire on boundary crossings, and
  // navigation happens only on release. Taps are handled by a Tap gesture
  // racing the pan — the detector consumes the bar's touches, so the inner
  // Pressables never receive them.
  const gesture = useMemo(() => {
    const indexAtX = (x: number, minimizedValue: number) => {
      'worklet';
      const sideInset = interpolate(
        minimizedValue,
        [0, 1],
        [0, MINIMIZED_INSET],
        Extrapolation.CLAMP,
      );
      const barWidth = windowWidth - BAR_MARGIN * 2 - sideInset * 2;
      const itemWidth = (barWidth - ROW_PAD_H * 2) / tabCount;
      const raw = (x - ROW_PAD_H) / itemWidth - 0.5;
      return Math.min(Math.max(raw, 0), tabCount - 1);
    };

    const pan = Gesture.Pan()
      .activeOffsetX([-6, 6])
      .failOffsetY([-14, 14])
      .onStart(() => {
        isDragging.value = true;
        lastTicked.value = Math.round(slideIndex.value);
        // Scrubbing is a deliberate bar interaction — surface the labels.
        setMinimized(minimized, 0);
      })
      .onUpdate((event) => {
        const index = indexAtX(event.x, progress.value);
        slideIndex.value = index;

        const rounded = Math.round(index);
        if (rounded !== lastTicked.value) {
          lastTicked.value = rounded;
          runOnJS(tick)();
        }
      })
      .onFinalize(() => {
        // Fires on failure too (e.g. the touch was a tap) — only act when
        // the pan actually activated, or we'd stomp the tap's navigation.
        if (!isDragging.value) {
          return;
        }
        const rounded = Math.round(slideIndex.value);
        slideIndex.value = withSpring(rounded, SLIDE_SPRING);
        runOnJS(selectIndex)(rounded);
        isDragging.value = false;
      });

    const tap = Gesture.Tap()
      // Real fingers drift a few points — the default tolerance (~2pt)
      // makes ordinary taps fail. Past 6pt horizontal the pan takes over.
      .maxDistance(16)
      .maxDuration(400)
      .onEnd((event, success) => {
        if (!success) {
          return;
        }
        const index = Math.round(indexAtX(event.x, progress.value));
        slideIndex.value = withSpring(index, SLIDE_SPRING);
        setMinimized(minimized, 0);
        runOnJS(selectIndex)(index);
      });

    return Gesture.Race(pan, tap);
  }, [windowWidth, tabCount, selectIndex, tick, isDragging, lastTicked, slideIndex, minimized, progress]);

  const barStyle = useAnimatedStyle(() => {
    const height = interpolate(
      progress.value,
      [0, 1],
      [EXPANDED_HEIGHT, MINIMIZED_HEIGHT],
      Extrapolation.CLAMP,
    );
    return {
      height,
      // Revolut-style: the pill shrinks in both dimensions.
      marginHorizontal: interpolate(progress.value, [0, 1], [0, MINIMIZED_INSET], Extrapolation.CLAMP),
    };
  });

  // The capsule shape lives on the glass view itself: iOS 26 glass renders
  // its own native corner configuration (true squircle + rim lighting).
  // Clipping a rectangular glass with an RN mask breaks that.
  const shapeStyle = useAnimatedStyle(() => {
    const height = interpolate(
      progress.value,
      [0, 1],
      [EXPANDED_HEIGHT, MINIMIZED_HEIGHT],
      Extrapolation.CLAMP,
    );
    return { borderRadius: height / 2 };
  });

  // One shared highlight that slides between tabs (transform-only → GPU).
  // All geometry derives from shared values, never from layout callbacks.
  const highlightStyle = useAnimatedStyle(() => {
    const barHeight = interpolate(
      progress.value,
      [0, 1],
      [EXPANDED_HEIGHT, MINIMIZED_HEIGHT],
      Extrapolation.CLAMP,
    );
    const height = interpolate(
      progress.value,
      [0, 1],
      [HIGHLIGHT_EXPANDED, HIGHLIGHT_MINIMIZED],
      Extrapolation.CLAMP,
    );
    const sideInset = interpolate(progress.value, [0, 1], [0, MINIMIZED_INSET], Extrapolation.CLAMP);
    const barWidth = windowWidth - BAR_MARGIN * 2 - sideInset * 2;
    const itemWidth = (barWidth - ROW_PAD_H * 2) / tabCount;
    return {
      height,
      width: itemWidth,
      borderRadius: height / 2,
      top: (barHeight - height) / 2,
      transform: [{ translateX: ROW_PAD_H + itemWidth * slideIndex.value }],
    };
  });

  const bottomOffset = Math.max(insets.bottom - 16, 12);
  const barContext = useMemo(
    () => ({ slideIndex, isDragging, theme }),
    [slideIndex, isDragging, theme],
  );

  return (
    <View
      {...props}
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
      {/* Progressive blur rising from the screen's bottom edge behind the pill. */}
      <ProgressiveBlur
        direction="bottom"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: bottomOffset + EXPANDED_HEIGHT + BLUR_BLEED,
        }}
      />
      <View
        pointerEvents="box-none"
        style={{ marginHorizontal: BAR_MARGIN, marginBottom: bottomOffset }}>
        <GestureDetector gesture={gesture}>
          <Animated.View style={barStyle}>
            {isLiquidGlassAvailable() ? (
              <AnimatedGlassView
                glassEffectStyle="regular"
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: theme.glassTint, borderCurve: 'continuous' },
                  shapeStyle,
                ]}
              />
            ) : (
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: theme.solidFallback, borderCurve: 'continuous' },
                  shapeStyle,
                ]}
              />
            )}
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  left: 0,
                  backgroundColor: theme.highlight,
                  borderCurve: 'continuous',
                },
                highlightStyle,
              ]}
            />
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: ROW_PAD_H,
              }}>
              <BarContext.Provider value={barContext}>{children}</BarContext.Provider>
            </View>
          </Animated.View>
        </GestureDetector>
      </View>
    </View>
  );
}

/** Icon rendered at a fixed tint (used twice for the crossfade layers). */
function TabGlyph({ item, tint }: { item: GlassTabItem; tint: string }) {
  if (item.renderIcon) {
    return (
      <View style={{ height: ICON_SIZE, justifyContent: 'center' }}>
        {item.renderIcon({ tint, size: ICON_SIZE })}
      </View>
    );
  }
  if (item.icon) {
    return <SymbolView name={item.icon} tintColor={tint} size={ICON_SIZE} weight="semibold" />;
  }
  return null;
}

/** One tab trigger: icon + label that fades when minimized. */
export function GlassTabButton({
  item,
  index,
  isFocused,
  onPress,
  ...props
}: TabTriggerSlotProps & { item: GlassTabItem; index: number }) {
  const minimized = useMinimizeState();
  const progress = minimized.progress;
  const bar = use(BarContext);
  const theme = bar?.theme ?? DEFAULT_THEME;
  const slideIndex = bar?.slideIndex;

  // Covers programmatic navigation too (deep links, back gestures). While
  // scrubbing, the finger owns the highlight — never fight it with a spring.
  useEffect(() => {
    if (isFocused && bar && !bar.isDragging.value) {
      bar.slideIndex.value = withSpring(index, SLIDE_SPRING);
    }
  }, [isFocused, index, bar]);

  // Tint follows the sliding highlight, not navigation focus: whatever the
  // pill is over lights up — live while scrubbing, traveling on taps.
  const activeGlyphStyle = useAnimatedStyle(() => ({
    opacity: slideIndex ? 1 - Math.min(Math.abs(slideIndex.value - index), 1) : isFocused ? 1 : 0,
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.4], [1, 0], Extrapolation.CLAMP),
    color: slideIndex
      ? interpolateColor(
          Math.min(Math.abs(slideIndex.value - index), 1),
          [0, 1],
          [theme.activeTint, theme.inactiveTint],
        )
      : isFocused
        ? theme.activeTint
        : theme.inactiveTint,
  }));

  // Height is animated EXPLICITLY (not derived from children) so the icon
  // stays perfectly centered every frame — layout-driven sizing lags behind
  // UI-thread animation.
  const boxStyle = useAnimatedStyle(() => ({
    height: interpolate(
      progress.value,
      [0, 1],
      [HIGHLIGHT_EXPANDED, HIGHLIGHT_MINIMIZED],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <Pressable
      {...props}
      onPress={(event) => {
        // The GestureDetector normally consumes touches; this still fires
        // for accessibility activation (VoiceOver) and keyboard focus.
        if (bar) bar.slideIndex.value = withSpring(index, SLIDE_SPRING);
        setMinimized(minimized, 0);
        onPress?.(event);
      }}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          { alignSelf: 'stretch', alignItems: 'center', paddingTop: ITEM_PAD_V, overflow: 'hidden' },
          boxStyle,
        ]}>
        {/* Inactive glyph underneath, active glyph crossfading on top. */}
        <View>
          <TabGlyph item={item} tint={theme.inactiveTint} />
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { alignItems: 'center', justifyContent: 'center' },
              activeGlyphStyle,
            ]}>
            <TabGlyph item={item} tint={theme.activeTint} />
          </Animated.View>
        </View>
        {/* Fades out and is clipped by the shrinking box — no layout anim. */}
        <Animated.Text
          numberOfLines={1}
          style={[{ fontSize: 9.5, fontWeight: '600', marginTop: ITEM_GAP }, labelStyle]}>
          {item.label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}
