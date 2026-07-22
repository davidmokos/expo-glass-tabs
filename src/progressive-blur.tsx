import { BlurView } from 'expo-blur';
import { View, ViewProps } from 'react-native';

type Props = ViewProps & {
  intensity?: number;
  /** Which edge the blur is anchored to (strongest there, fading away). */
  direction?: 'top' | 'bottom';
};

/**
 * Progressive (gradient) blur: strongest at the anchored edge, fading to
 * none. iOS has no public variable-blur API, so we stack many thin
 * BlurViews with a tiny per-layer intensity — each layer's edge adds only
 * an imperceptible step, so the falloff reads as continuous. A soft black
 * gradient smooths the tail and keeps overlaid content legible.
 */
export function ProgressiveBlur({ style, intensity = 5, direction = 'top', ...rest }: Props) {
  const heights = ['100%', '88%', '76%', '64%', '54%', '44%', '36%', '28%', '22%', '16%'] as const;
  const anchor = direction === 'top' ? { top: 0 } : { bottom: 0 };

  return (
    <View pointerEvents="none" style={style} {...rest}>
      {heights.map((height, index) => (
        <BlurView
          key={index}
          tint="dark"
          intensity={intensity}
          style={{ position: 'absolute', left: 0, right: 0, height, ...anchor }}
        />
      ))}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          experimental_backgroundImage: `linear-gradient(to ${direction === 'top' ? 'bottom' : 'top'}, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0.32) 42%, rgba(0,0,0,0.08) 68%, rgba(0,0,0,0) 88%)`,
        }}
      />
    </View>
  );
}
