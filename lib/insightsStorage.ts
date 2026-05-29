import { IQInsight } from "@/types/insights"

const STORAGE_KEY = "mtm_iq_insights_v1"
const MAX_INSIGHTS = 50

export function loadInsights(): IQInsight[] {
  if (typeof window === "undefined") return []
  
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return []
    
    const insights = JSON.parse(data) as IQInsight[]
    return insights.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch (error) {
    console.error("Erro ao carregar insights:", error)
    return []
  }
}

export function saveInsights(insights: IQInsight[]) {
  if (typeof window === "undefined") return
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(insights))
  } catch (error) {
    console.error("Erro ao guardar insights:", error)
  }
}

export function createInsight(insight: IQInsight) {
  const insights = loadInsights()
  
  if (insights.length >= MAX_INSIGHTS) {
    throw new Error("LIMIT_REACHED")
  }
  
  insights.push(insight)
  saveInsights(insights)
  return insight
}

export function updateInsight(id: string, updates: Partial<IQInsight>) {
  const insights = loadInsights()
  const index = insights.findIndex(i => i.id === id)
  
  if (index === -1) {
    throw new Error("Insight não encontrado")
  }
  
  insights[index] = {
    ...insights[index],
    ...updates,
    updatedAt: Date.now()
  }
  
  saveInsights(insights)
  return insights[index]
}

export function deleteInsight(id: string) {
  const insights = loadInsights()
  const filtered = insights.filter(i => i.id !== id)
  saveInsights(filtered)
}

export function getInsight(id: string): IQInsight | null {
  const insights = loadInsights()
  return insights.find(i => i.id === id) || null
}


