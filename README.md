# expo-glass-tabs

A floating **liquid-glass tab bar** for [Expo Router](https://docs.expo.dev/router/introduction/) headless tabs, in the style of the Revolut app:

- **Minimize on scroll** — the pill shrinks in *both* dimensions and labels collapse while every icon stays visible (unlike iOS's native `minimizeBehavior`, which collapses to a single icon).
- **Sliding highlight** — the active-tab pill physically travels between tabs on an interruptible, transform-only spring.
- **Finger scrubbing** — drag along the bar to preview tabs: the highlight tracks your finger 1:1, icons/labels light up live, haptic ticks fire on boundary crossings, and navigation happens on release.
- **Progressive edge blur** — content dissolves gradually behind the bar (and optionally behind your top bar) with no hard blur edge.
- **Subtle screen transitions** — fade + micro-scale between tabs via a `TabSlot` `renderFn`.
- **Native materials** — iOS 26 liquid glass via `expo-glass-effect` (true squircle corners + rim refraction), with a solid fallback for older iOS and Android.

Pure TypeScript — no custom native code, works in Expo Go and any dev build.

## Installation

```sh
npx expo install expo-glass-tabs expo-blur expo-glass-effect expo-haptics expo-symbols react-native-gesture-handler react-native-reanimated react-native-safe-area-context react-native-screens
```

Wrap your app root in `GestureHandlerRootView` (Expo Router does not do this for you):

```tsx
// app/_layout.tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* ... */}
    </GestureHandlerRootView>
  );
}
```

## Usage

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

Attach the scroll hook in every screen that should minimize the bar:

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

### Custom icons

Use `renderIcon` when an SF Symbol won't do (a brand logo, for example). It's called
once per tint layer so the crossfade stays on the UI thread:

```tsx
{
  name: 'index', href: '/', label: 'Home',
  renderIcon: ({ tint }) => (
    <Image source={require('./logo.png')} tintColor={tint} style={{ width: 18, height: 17 }} />
  ),
}
```

### Theming

```tsx
<GlassTabBar
  theme={{
    activeTint: '#FFFFFF',
    inactiveTint: '#9E9EA6',
    highlight: 'rgba(255,255,255,0.14)',
    glassTint: 'rgba(10,10,12,0.55)',
    solidFallback: 'rgba(18,18,20,0.94)',
  }}
  haptics // picker-style tick while scrubbing (iOS), default true
/>
```

### Progressive blur for your own edges

`ProgressiveBlur` is exported — use it behind a transparent header:

```tsx
import { ProgressiveBlur } from 'expo-glass-tabs';

<ProgressiveBlur direction="top" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 160 }} />
```

## API

| Export | Kind | Purpose |
| --- | --- | --- |
| `GlassTabBar` | component | The floating pill — use via `TabList asChild` |
| `GlassTabButton` | component | One trigger — use via `TabTrigger asChild` |
| `TabBarMinimizeProvider` | component | Wrap the `Tabs` tree once |
| `useMinimizeOnScroll()` | hook | Scroll handler for `Animated.ScrollView` |
| `useTabBarMinimized()` | hook | The raw 0..1 shared value, for custom UI |
| `renderFadingTabScreen` | function | `TabSlot renderFn` with fade + micro-scale |
| `ProgressiveBlur` | component | Gradient blur anchored to a screen edge |

## License

MIT © David Mokos
