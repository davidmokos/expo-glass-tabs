<div align="center">

# expo-glass-tabs

**A floating liquid-glass tab bar for Expo Router — the Revolut-style bottom bar.**

[![npm version](https://img.shields.io/npm/v/expo-glass-tabs?logo=npm&color=CB3837)](https://www.npmjs.com/package/expo-glass-tabs)
[![npm downloads](https://img.shields.io/npm/dm/expo-glass-tabs?color=blue)](https://www.npmjs.com/package/expo-glass-tabs)
[![TypeScript](https://img.shields.io/badge/TypeScript-first-3178C6?logo=typescript&logoColor=white)](#api)
[![license](https://img.shields.io/npm/l/expo-glass-tabs?color=green)](./LICENSE)

<img src="https://raw.githubusercontent.com/davidmokos/expo-glass-tabs/main/assets/demo.gif" alt="expo-glass-tabs demo — liquid glass tab bar minimizing on scroll" width="640" />

</div>

---

## Why

iOS 26's native tab bar can minimize on scroll — but it collapses to a **single icon**. Revolut's bar keeps *all* tabs visible and just drops the labels, shrinking the pill in both dimensions. That behavior isn't reachable from the native `UITabBar`, so this package rebuilds it on top of Expo Router's headless tabs — with real native materials.

## Features

- 🪟 **Real liquid glass** — iOS 26 `UIGlassEffect` via `expo-glass-effect`: true squircle corners, rim refraction, content lensing. Solid fallback on older iOS and Android.
- 📉 **Minimize on scroll** — scroll down and the pill shrinks in both dimensions while labels collapse; every icon stays visible. Scroll up to expand. Critically-damped springs, no flicker (rubber-band overscroll is filtered out).
- 🛝 **Sliding highlight** — the active-tab pill physically travels between tabs on an interruptible, transform-only spring.
- 👆 **Finger scrubbing** — drag along the bar: the highlight tracks your finger 1:1, icons light up as you pass them, haptic ticks fire at each boundary, and navigation happens on release — screens never jump mid-drag.
- 🌫️ **Progressive edge blur** — content dissolves gradually behind the bar with no hard blur line. The same component works for top bars.
- 🎞️ **Subtle screen transitions** — fade + micro-scale between tabs via a `TabSlot` `renderFn`.
- ⚡ **UI-thread everything** — all animation runs in Reanimated worklets with native gesture recognizers; a blocked JS thread doesn't drop a frame.
- 🧩 **Pure TypeScript** — no custom native code. Works in Expo Go and any dev build.

## Installation

```sh
npx expo install expo-glass-tabs expo-blur expo-glass-effect expo-haptics expo-symbols react-native-gesture-handler react-native-reanimated react-native-safe-area-context react-native-screens
```

Wrap your app root in `GestureHandlerRootView` (Expo Router does not do this for you):

```tsx
// app/_layout.tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
  return <GestureHandlerRootView style={{ flex: 1 }}>{/* ... */}</GestureHandlerRootView>;
}
```

## Quick start

```tsx
import { useRouter } from 'expo-router';
import { Tabs, TabList, TabSlot, TabTrigger } from 'expo-router/ui';
import {
  GlassTabBar,
  GlassTabButton,
  TabBarMinimizeProvider,
  renderFadingTabScreen,
  type GlassTabItem,
} from 'expo-glass-tabs';

const ITEMS: (GlassTabItem & { href: string })[] = [
  { name: 'index', href: '/', label: 'Home', icon: 'house.fill' },
  { name: 'invest', href: '/invest', label: 'Invest', icon: 'chart.line.uptrend.xyaxis' },
  { name: 'payments', href: '/payments', label: 'Payments', icon: 'arrow.left.arrow.right' },
  { name: 'crypto', href: '/crypto', label: 'Crypto', icon: 'bitcoinsign' },
];

export default function AppTabs() {
  const router = useRouter();
  return (
    <TabBarMinimizeProvider>
      <Tabs>
        <TabSlot style={{ height: '100%' }} renderFn={renderFadingTabScreen} />
        <TabList asChild>
          <GlassTabBar onIndexSelected={(i) => router.navigate(ITEMS[i].href as never)}>
            {ITEMS.map(({ href, ...item }, index) => (
              <TabTrigger key={item.name} name={item.name} href={href as never} asChild>
                <GlassTabButton item={item} index={index} />
              </TabTrigger>
            ))}
          </GlassTabBar>
        </TabList>
      </Tabs>
    </TabBarMinimizeProvider>
  );
}
```

Then attach the scroll hook in every screen that should minimize the bar:

```tsx
import Animated from 'react-native-reanimated';
import { useMinimizeOnScroll } from 'expo-glass-tabs';

export default function HomeScreen() {
  const onScroll = useMinimizeOnScroll();
  return (
    <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16}>
      {/* content */}
    </Animated.ScrollView>
  );
}
```

## Custom icons

Use `renderIcon` when an SF Symbol won't do — a brand logo, for example. It's called once per tint layer, so the active/inactive crossfade stays on the UI thread:

```tsx
import { Image } from 'expo-image';

const home: GlassTabItem = {
  name: 'index',
  label: 'Home',
  renderIcon: ({ tint }) => (
    <Image source={require('./logo.png')} tintColor={tint} style={{ width: 18, height: 17 }} />
  ),
};
```

## Theming

```tsx
<GlassTabBar
  theme={{
    activeTint: '#FFFFFF',
    inactiveTint: '#9E9EA6',
    highlight: 'rgba(255,255,255,0.14)',   // sliding pill
    glassTint: 'rgba(10,10,12,0.55)',      // tint over the liquid glass
    solidFallback: 'rgba(18,18,20,0.94)',  // pre-iOS 26 / Android background
  }}
  haptics // scrub tick (iOS), default true
/>
```

## Progressive blur for your own edges

`ProgressiveBlur` is exported on its own — drop it behind a transparent header:

```tsx
import { ProgressiveBlur } from 'expo-glass-tabs';

<ProgressiveBlur
  direction="top"
  style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 160 }}
/>;
```

## API

| Export | Kind | Purpose |
| --- | --- | --- |
| `GlassTabBar` | component | The floating pill — use via `TabList asChild` |
| `GlassTabButton` | component | One trigger — use via `TabTrigger asChild` |
| `TabBarMinimizeProvider` | component | Wrap the `Tabs` tree once |
| `useMinimizeOnScroll()` | hook | Scroll handler for `Animated.ScrollView` |
| `useTabBarMinimized()` | hook | Raw 0..1 minimize progress, for custom UI |
| `renderFadingTabScreen` | function | `TabSlot` `renderFn` with fade + micro-scale |
| `ProgressiveBlur` | component | Gradient blur anchored to a screen edge |
| `MINIMIZE_SPRING` | constant | The spring config, if you want to match it |

## How it works

The bar's *structure* is declared in JS (Expo Router headless tabs), but everything you see and feel at runtime is native:

- **Materials** — `UIGlassEffect`, `UIVisualEffectView`, SF Symbols, `UIFeedbackGenerator`.
- **Motion** — Reanimated worklets on the UI thread; the sliding highlight and scrub are transform-only (GPU-composited, no layout work per frame).
- **Gestures** — native recognizers via `react-native-gesture-handler`; a `Pan` (scrub) races a `Tap`, so taps stay forgiving while drags feel attached to the finger.

The corner geometry is rendered by the glass view itself (its native corner configuration), not an RN clipping mask — that's what preserves the true squircle and the rim lighting through the whole minimize animation.

## License

MIT © [David Mokos](https://github.com/davidmokos)
