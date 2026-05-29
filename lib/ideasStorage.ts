import { IQIdea } from "@/types/insights"

const STORAGE_KEY = "mtm_iq_ideas_v1"
const MAX_IDEAS = 100

export function loadIdeas(): IQIdea[] {
  if (typeof window === "undefined") return []
  
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return []
    
    const ideas = JSON.parse(data) as IQIdea[]
    return ideas.sort((a, b) => b.createdAt - a.createdAt)
  } catch (error) {
    console.error("Erro ao carregar ideas:", error)
    return []
  }
}

export function saveIdeas(ideas: IQIdea[]) {
  if (typeof window === "undefined") return
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ideas))
  } catch (error) {
    console.error("Erro ao guardar ideas:", error)
  }
}

export function createIdea(idea: IQIdea) {
  const ideas = loadIdeas()
  
  if (ideas.length >= MAX_IDEAS) {
    throw new Error("LIMIT_REACHED")
  }
  
  ideas.push(idea)
  saveIdeas(ideas)
  return idea
}

export function updateIdea(id: string, updates: Partial<IQIdea>) {
  const ideas = loadIdeas()
  const index = ideas.findIndex(i => i.id === id)
  
  if (index === -1) {
    throw new Error("Idea não encontrada")
  }
  
  ideas[index] = {
    ...ideas[index],
    ...updates,
    updatedAt: Date.now()
  }
  
  saveIdeas(ideas)
  return ideas[index]
}

export function deleteIdea(id: string) {
  const ideas = loadIdeas()
  const filtered = ideas.filter(i => i.id !== id)
  saveIdeas(filtered)
}

export function toggleLikeIdea(id: string) {
  const ideas = loadIdeas()
  const index = ideas.findIndex(i => i.id === id)
  
  if (index === -1) return
  
  const idea = ideas[index]
  idea.isLiked = !idea.isLiked
  idea.likes = (idea.likes || 0) + (idea.isLiked ? 1 : -1)
  
  saveIdeas(ideas)
  return idea
}


