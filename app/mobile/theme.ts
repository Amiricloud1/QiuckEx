import tokens from "../../packages/design-tokens/tokens.json";

const px = (value: number) => value;

export const colors = {
  primary: tokens.color.brand.primary,
  secondary: tokens.color.brand.secondary,
  destructive: tokens.color.brand.destructive,
  muted: tokens.color.brand.muted,
  neutral: tokens.color.neutral,
} as const;

export const fontSize = Object.fromEntries(
  Object.entries(tokens.fontSize).map(([key, value]) => [key, px(value)])
) as Record<keyof typeof tokens.fontSize, number>;

export const fontWeight = Object.fromEntries(
  Object.entries(tokens.fontWeight).map(([key, value]) => [key, String(value)])
) as Record<keyof typeof tokens.fontWeight, string>;

export const spacing = Object.fromEntries(
  Object.entries(tokens.spacing).map(([key, value]) => [key, px(value)])
) as Record<keyof typeof tokens.spacing, number>;

export const borderRadius = Object.fromEntries(
  Object.entries(tokens.borderRadius).map(([key, value]) => [key, px(value)])
) as Record<keyof typeof tokens.borderRadius, number>;

/**
 * Visual treatment for unverified assets.
 *
 * The badge and explanation surface must not rely on color alone: consumers
 * pair these colors with a text label and an icon (see the unverified-asset
 * badge component). Colors are chosen to meet WCAG AA contrast for the
 * foreground/background pairs below.
 */
export const unverifiedAsset = {
  badge: {
    background: tokens.color.brand.muted,
    foreground: tokens.color.neutral,
    border: tokens.color.brand.destructive,
    icon: tokens.color.brand.destructive,
  },
  explanation: {
    background: tokens.color.brand.muted,
    foreground: tokens.color.neutral,
    border: tokens.color.brand.destructive,
    icon: tokens.color.brand.destructive,
  },
} as const;

export const theme = {
  colors,
  fontSize,
  fontWeight,
  spacing,
  borderRadius,
  unverifiedAsset,
} as const;

export default theme;