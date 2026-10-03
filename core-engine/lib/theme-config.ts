export interface ThemeConfig {
  id: string
  name: string
  colors: {
    primary: string
    primaryLight: string
    primaryDark: string
    primaryDarker: string
    background: string
    backgroundLight: string
    text: string
    textMuted: string
    border: string
    accent: string
  }
}

export const themes: Record<string, ThemeConfig> = {
  default: {
    id: 'default',
    name: 'MoreThanMoney Gold',
    colors: {
      primary: '#efb810',        // Dourado principal
      primaryLight: '#f9db5c',   // Dourado claro
      primaryDark: '#b28405',    // Dourado escuro
      primaryDarker: '#795300',  // Dourado mais escuro
      background: '#000000',      // Preto
      backgroundLight: '#1a1a1a', // Preto claro
      text: '#ffffff',            // Branco
      textMuted: '#a0a0a0',      // Cinza
      border: 'rgba(239, 184, 16, 0.3)', // Borda dourada com transparência
      accent: '#efb810',          // Accent dourado
    }
  },
  dark: {
    id: 'dark',
    name: 'Dark Elegance',
    colors: {
      primary: '#8b5cf6',        // Roxo
      primaryLight: '#a78bfa',   // Roxo claro
      primaryDark: '#7c3aed',    // Roxo escuro
      primaryDarker: '#6d28d9',  // Roxo mais escuro
      background: '#0a0a0a',      // Preto profundo
      backgroundLight: '#1f1f1f', // Cinza escuro
      text: '#ffffff',            // Branco
      textMuted: '#9ca3af',      // Cinza
      border: 'rgba(139, 92, 246, 0.3)', // Borda roxa
      accent: '#8b5cf6',          // Accent roxo
    }
  },
  light: {
    id: 'light',
    name: 'Light Professional',
    colors: {
      primary: '#2563eb',        // Azul
      primaryLight: '#60a5fa',   // Azul claro
      primaryDark: '#1d4ed8',    // Azul escuro
      primaryDarker: '#1e40af',  // Azul mais escuro
      background: '#f8fafc',      // Branco suave
      backgroundLight: '#ffffff', // Branco puro
      text: '#0f172a',            // Preto suave
      textMuted: '#64748b',      // Cinza
      border: 'rgba(37, 99, 235, 0.3)', // Borda azul
      accent: '#2563eb',          // Accent azul
    }
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean Breeze',
    colors: {
      primary: '#06b6d4',        // Ciano
      primaryLight: '#22d3ee',   // Ciano claro
      primaryDark: '#0891b2',    // Ciano escuro
      primaryDarker: '#0e7490',  // Ciano mais escuro
      background: '#0c1a1f',      // Azul muito escuro
      backgroundLight: '#1e3a44', // Azul escuro
      text: '#ffffff',            // Branco
      textMuted: '#94a3b8',      // Cinza azulado
      border: 'rgba(6, 182, 212, 0.3)', // Borda ciano
      accent: '#06b6d4',          // Accent ciano
    }
  }
}

export const defaultTheme = themes.default

export function applyTheme(theme: ThemeConfig) {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  
  root.style.setProperty('--color-primary', theme.colors.primary)
  root.style.setProperty('--color-primary-light', theme.colors.primaryLight)
  root.style.setProperty('--color-primary-dark', theme.colors.primaryDark)
  root.style.setProperty('--color-primary-darker', theme.colors.primaryDarker)
  root.style.setProperty('--color-background', theme.colors.background)
  root.style.setProperty('--color-background-light', theme.colors.backgroundLight)
  root.style.setProperty('--color-text', theme.colors.text)
  root.style.setProperty('--color-text-muted', theme.colors.textMuted)
  root.style.setProperty('--color-border', theme.colors.border)
  root.style.setProperty('--color-accent', theme.colors.accent)
}

export function saveThemeToLocalStorage(themeId: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem('mtm-theme', themeId)
}

export function getThemeFromLocalStorage(): string {
  if (typeof window === 'undefined') return 'default'
  return localStorage.getItem('mtm-theme') || 'default'
}

export function getCurrentTheme(): ThemeConfig {
  const themeId = getThemeFromLocalStorage()
  return themes[themeId] || defaultTheme
}
