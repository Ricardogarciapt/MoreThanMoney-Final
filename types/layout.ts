// Tipos para o sistema de layouts MTM (estilo IQ Charts)

export type ScannerKey = 
  | "GoldenZone"
  | "Momentum"
  | "KillShot"
  | "Supernova"
  | "Smartmonics"
  | "Winzone"
  | "Nexus"
  | "Sinergy"

export interface MTMChartLayout {
  version: "1.0"
  id: string
  name: string
  createdAt: number
  updatedAt: number

  chart: {
    symbol: string
    timeframe: string
    theme: "light" | "dark"
  }

  scanners: {
    active: ScannerKey[]
  }

  ui: {
    favoriteTimeframe: string
  }
}

