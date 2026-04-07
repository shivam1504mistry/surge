// Surge Design System
// Source of truth for all colours, typography, spacing and radii.
// All agents import from here — never hardcode values in component files.

export const Colors = {
  bg:          '#0D0D0D',
  surface:     '#1A1A1A',
  surface2:    '#242424',
  border:      '#2E2E2E',
  accent:      '#FF4D00',
  accentSoft:  'rgba(255,77,0,0.15)',
  green:       '#00D26A',
  greenSoft:   'rgba(0,210,106,0.15)',
  blue:        '#3B82F6',
  text1:       '#FFFFFF',
  text2:       '#A0A0A0',
  text3:       '#555555',
  warning:     '#FFB800',
  error:       '#FF3B30',
} as const

export const FontSize = {
  xs:   10,
  sm:   12,
  base: 14,
  md:   16,
  lg:   18,
  xl:   22,
  xxl:  28,
  hero: 42,
} as const

export const FontWeight = {
  regular: '400',
  medium:  '500',
  semibold:'600',
  bold:    '700',
  extrabold:'800',
  black:   '900',
} as const

export const Radius = {
  sm:   8,
  md:   14,
  lg:   20,
  full: 999,
} as const

export const Spacing = {
  xs:   4,
  sm:   8,
  md:   16,
  lg:   24,
  xl:   32,
  xxl:  48,
} as const

export const Shadow = {
  accent: {
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
} as const
