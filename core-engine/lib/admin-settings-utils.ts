import type { ThemeConfig } from './theme-config'
import { defaultTheme, themes } from './theme-config'

export function parseAdminSettingValue<T>(value: unknown): T | null {
  if (value == null) return null
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return value as T
    }
  }
  return value as T
}

export interface StoredThemeConfig {
  theme: string
  colors: ThemeConfig['colors']
  updated_at?: string
}

export function resolveStoredTheme(raw: unknown): StoredThemeConfig {
  const parsed = parseAdminSettingValue<StoredThemeConfig>(raw)
  if (parsed?.theme && parsed?.colors) {
    return parsed
  }
  return {
    theme: defaultTheme.id,
    colors: { ...defaultTheme.colors },
  }
}

export function buildThemeConfig(stored: StoredThemeConfig): ThemeConfig {
  const preset = themes[stored.theme]
  return {
    id: stored.theme,
    name: preset?.name ?? 'Personalizado',
    colors: {
      ...(preset?.colors ?? defaultTheme.colors),
      ...stored.colors,
    },
  }
}
