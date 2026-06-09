// Engine de persistência de layouts MTM (estilo IQ Charts / TradingView)

import { MTMChartLayout } from "@/types/layout"

const STORAGE_KEY = "mtm_chart_layouts_v1"
const MAX_LAYOUTS = 20

export function loadLayouts(): MTMChartLayout[] {
  try {
    if (typeof window === "undefined") return []
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveLayouts(layouts: MTMChartLayout[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts))
  } catch (e) {
    console.error("Erro ao salvar layouts:", e)
  }
}

export function createLayout(layout: MTMChartLayout): void {
  const layouts = loadLayouts()

  if (layouts.length >= MAX_LAYOUTS) {
    throw new Error("LIMIT_REACHED")
  }

  layouts.push(layout)
  saveLayouts(layouts)
}

export function updateLayout(id: string, updates: Partial<MTMChartLayout>): void {
  const layouts = loadLayouts()
  const index = layouts.findIndex(l => l.id === id)
  
  if (index === -1) {
    throw new Error("LAYOUT_NOT_FOUND")
  }

  layouts[index] = {
    ...layouts[index],
    ...updates,
    updatedAt: Date.now(),
  }
  
  saveLayouts(layouts)
}

export function deleteLayout(id: string): void {
  const layouts = loadLayouts().filter(l => l.id !== id)
  saveLayouts(layouts)
}

export function getLayout(id: string): MTMChartLayout | null {
  const layouts = loadLayouts()
  return layouts.find(l => l.id === id) || null
}

export function duplicateLayout(id: string): MTMChartLayout | null {
  const layout = getLayout(id)
  if (!layout) return null

  const duplicated: MTMChartLayout = {
    ...layout,
    id: crypto.randomUUID(),
    name: `${layout.name} (Cópia)`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  try {
    createLayout(duplicated)
    return duplicated
  } catch {
    return null
  }
}

