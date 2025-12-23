// Serviço de banco de dados para gerenciar conexões e operações básicas

// Tipos para membros e ideias
export interface Member {
  id: string
  username: string
  name: string
  email: string
  phone?: string
  socialLink?: string
  jifuId?: string
  package?: string
  role?: string
  createdAt: Date
  lastLogin?: Date
}

export interface TradingIdea {
  id: string
  title: string
  description: string
  symbol: string
  timeframe: string
  direction: "long" | "short"
  entryPrice?: number
  stopLoss?: number
  takeProfit?: number
  riskReward?: number
  authorId: string
  createdAt: Date
  updatedAt?: Date
  likes: number
  comments: TradingIdeaComment[]
  status: "active" | "closed" | "cancelled"
  result?: "win" | "loss" | "breakeven"
  pnl?: number
}

export interface TradingIdeaComment {
  id: string
  ideaId: string
  authorId: string
  content: string
  createdAt: Date
}

// Classe para gerenciar o banco de dados
class DatabaseService {
  private static instance: DatabaseService
  private isInitialized = false

  // Singleton pattern
  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService()
    }
    return DatabaseService.instance
  }

  // Inicializar conexão com o banco de dados
  public async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      // Em produção, aqui seria a inicialização da conexão com o banco de dados real
      // Por enquanto, vamos simular usando localStorage
      if (typeof window !== "undefined") {
        // Inicializar tabelas se não existirem
        if (!localStorage.getItem("members")) {
          localStorage.setItem("members", JSON.stringify([]))
        }

        if (!localStorage.getItem("tradingIdeas")) {
          localStorage.setItem("tradingIdeas", JSON.stringify([]))
        }

        if (!localStorage.getItem("tradingIdeaComments")) {
          localStorage.setItem("tradingIdeaComments", JSON.stringify([]))
        }
      }

      this.isInitialized = true
      console.log("Database initialized successfully")
    } catch (error) {
      console.error("Failed to initialize database:", error)
      throw error
    }
  }

  // Métodos genéricos para operações CRUD
  public async create<T>(collection: string, data: T): Promise<T> {
    await this.initialize()

    try {
      if (typeof window !== "undefined") {
        const items = JSON.parse(localStorage.getItem(collection) || "[]")
        const newItem = { ...data, id: this.generateId() }
        items.push(newItem)
        localStorage.setItem(collection, JSON.stringify(items))
        return newItem as T
      }
      throw new Error("Cannot access localStorage")
    } catch (error) {
      console.error(`Failed to create item in ${collection}:`, error)
      throw error
    }
  }

  public async getAll<T>(collection: string): Promise<T[]> {
    await this.initialize()

    try {
      if (typeof window !== "undefined") {
        return JSON.parse(localStorage.getItem(collection) || "[]") as T[]
      }
      return [] as T[]
    } catch (error) {
      console.error(`Failed to get items from ${collection}:`, error)
      throw error
    }
  }

  public async getById<T>(collection: string, id: string): Promise<T | null> {
    await this.initialize()

    try {
      if (typeof window !== "undefined") {
        const items = JSON.parse(localStorage.getItem(collection) || "[]") as any[]
        const item = items.find((item) => item.id === id)
        return item ? (item as T) : null
      }
      return null
    } catch (error) {
      console.error(`Failed to get item from ${collection}:`, error)
      throw error
    }
  }

  public async update<T>(collection: string, id: string, data: Partial<T>): Promise<T | null> {
    await this.initialize()

    try {
      if (typeof window !== "undefined") {
        const items = JSON.parse(localStorage.getItem(collection) || "[]") as any[]
        const index = items.findIndex((item) => item.id === id)

        if (index === -1) return null

        const updatedItem = { ...items[index], ...data, updatedAt: new Date() }
        items[index] = updatedItem
        localStorage.setItem(collection, JSON.stringify(items))

        return updatedItem as T
      }
      return null
    } catch (error) {
      console.error(`Failed to update item in ${collection}:`, error)
      throw error
    }
  }

  public async delete(collection: string, id: string): Promise<boolean> {
    await this.initialize()

    try {
      if (typeof window !== "undefined") {
        const items = JSON.parse(localStorage.getItem(collection) || "[]") as any[]
        const filteredItems = items.filter((item) => item.id !== id)

        if (filteredItems.length === items.length) return false

        localStorage.setItem(collection, JSON.stringify(filteredItems))
        return true
      }
      return false
    } catch (error) {
      console.error(`Failed to delete item from ${collection}:`, error)
      throw error
    }
  }

  // Método para busca com filtros
  public async query<T>(collection: string, filters: Record<string, any>): Promise<T[]> {
    await this.initialize()

    try {
      if (typeof window !== "undefined") {
        const items = JSON.parse(localStorage.getItem(collection) || "[]") as any[]

        return items.filter((item) => {
          return Object.entries(filters).every(([key, value]) => {
            return item[key] === value
          })
        }) as T[]
      }
      return [] as T[]
    } catch (error) {
      console.error(`Failed to query items from ${collection}:`, error)
      throw error
    }
  }

  // Utilitário para gerar IDs únicos
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2)
  }
}

// Exportar instância singleton
export const db = DatabaseService.getInstance()
