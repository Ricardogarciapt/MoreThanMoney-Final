import { ScannerKey } from "./layout"

// IQ Insights - Layouts completos guardados com preview
export interface IQInsight {
  id: string
  name: string
  description?: string
  author: string
  createdAt: number
  updatedAt: number
  
  // Estado completo do gráfico
  chart: {
    symbol: string
    timeframe: string
    theme: "light" | "dark"
  }
  
  scanners: {
    active: ScannerKey[]
  }
  
  // Preview (screenshot base64 ou URL)
  preview?: string
  
  // Metadata
  tags?: string[]
  isPublic?: boolean
}

// IQ Ideas - Posts sociais com imagens
export interface IQIdea {
  id: string
  author: string
  createdAt: number
  updatedAt?: number
  
  // Conteúdo
  title: string
  content: string
  symbol?: string
  bias?: "Bullish" | "Bearish" | "Neutral"
  
  // Imagem (screenshot do chart)
  image?: string
  
  // Social
  likes?: number
  comments?: number
  isLiked?: boolean
}


