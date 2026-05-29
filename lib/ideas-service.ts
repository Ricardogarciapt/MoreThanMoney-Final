import { db, type TradingIdea, type TradingIdeaComment } from "./database-service"

// Serviço para gerenciar operações relacionadas a ideias de trading
export class IdeasService {
  private static instance: IdeasService

  // Singleton pattern
  public static getInstance(): IdeasService {
    if (!IdeasService.instance) {
      IdeasService.instance = new IdeasService()
    }
    return IdeasService.instance
  }

  // Criar uma nova ideia de trading
  public async createIdea(
    ideaData: Omit<TradingIdea, "id" | "createdAt" | "likes" | "comments">,
  ): Promise<TradingIdea> {
    try {
      const newIdea = await db.create<TradingIdea>("tradingIdeas", {
        ...ideaData,
        id: "", // Será gerado pelo serviço de banco de dados
        createdAt: new Date(),
        likes: 0,
        comments: [],
      })

      return newIdea
    } catch (error) {
      console.error("Erro ao criar ideia de trading:", error)
      throw error
    }
  }

  // Obter todas as ideias de trading
  public async getAllIdeas(): Promise<TradingIdea[]> {
    const ideas = await db.getAll<TradingIdea>("tradingIdeas")

    // Ordenar por data de criação (mais recentes primeiro)
    return ideas.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  // Obter ideias de trading ativas
  public async getActiveIdeas(): Promise<TradingIdea[]> {
    const ideas = await db.query<TradingIdea>("tradingIdeas", { status: "active" })

    // Ordenar por data de criação (mais recentes primeiro)
    return ideas.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  // Obter ideia de trading por ID
  public async getIdeaById(id: string): Promise<TradingIdea | null> {
    return await db.getById<TradingIdea>("tradingIdeas", id)
  }

  // Obter ideias de trading por autor
  public async getIdeasByAuthor(authorId: string): Promise<TradingIdea[]> {
    const ideas = await db.query<TradingIdea>("tradingIdeas", { authorId })

    // Ordenar por data de criação (mais recentes primeiro)
    return ideas.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  // Atualizar ideia de trading
  public async updateIdea(id: string, data: Partial<TradingIdea>): Promise<TradingIdea | null> {
    return await db.update<TradingIdea>("tradingIdeas", id, {
      ...data,
      updatedAt: new Date(),
    })
  }

  // Atualizar status da ideia de trading
  public async updateIdeaStatus(
    id: string,
    status: "active" | "closed" | "cancelled",
    result?: "win" | "loss" | "breakeven",
    pnl?: number,
  ): Promise<TradingIdea | null> {
    return await db.update<TradingIdea>("tradingIdeas", id, {
      status,
      result,
      pnl,
      updatedAt: new Date(),
    })
  }

  // Curtir uma ideia de trading
  public async likeIdea(id: string): Promise<TradingIdea | null> {
    const idea = await this.getIdeaById(id)
    if (!idea) return null

    return await db.update<TradingIdea>("tradingIdeas", id, {
      likes: idea.likes + 1,
    })
  }

  // Adicionar comentário a uma ideia de trading
  public async addComment(ideaId: string, authorId: string, content: string): Promise<TradingIdeaComment | null> {
    try {
      const idea = await this.getIdeaById(ideaId)
      if (!idea) return null

      const comment: TradingIdeaComment = {
        id: Date.now().toString(36) + Math.random().toString(36).substring(2),
        ideaId,
        authorId,
        content,
        createdAt: new Date(),
      }

      // Adicionar comentário à lista de comentários da ideia
      const updatedIdea = await db.update<TradingIdea>("tradingIdeas", ideaId, {
        comments: [...idea.comments, comment],
      })

      if (!updatedIdea) return null

      return comment
    } catch (error) {
      console.error("Erro ao adicionar comentário:", error)
      throw error
    }
  }

  // Excluir ideia de trading
  public async deleteIdea(id: string): Promise<boolean> {
    return await db.delete("tradingIdeas", id)
  }

  // Obter estatísticas de ideias de trading
  public async getIdeasStats(): Promise<{
    total: number
    active: number
    closed: number
    winRate: number
    bySymbol: Record<string, number>
    byDirection: Record<string, number>
  }> {
    const ideas = await this.getAllIdeas()
    const closedIdeas = ideas.filter((idea) => idea.status === "closed")
    const winningIdeas = closedIdeas.filter((idea) => idea.result === "win")

    const stats = {
      total: ideas.length,
      active: ideas.filter((idea) => idea.status === "active").length,
      closed: closedIdeas.length,
      winRate: closedIdeas.length > 0 ? (winningIdeas.length / closedIdeas.length) * 100 : 0,
      bySymbol: {} as Record<string, number>,
      byDirection: {
        long: 0,
        short: 0,
      },
    }

    // Contar por símbolo
    ideas.forEach((idea) => {
      stats.bySymbol[idea.symbol] = (stats.bySymbol[idea.symbol] || 0) + 1
    })

    // Contar por direção
    ideas.forEach((idea) => {
      stats.byDirection[idea.direction] += 1
    })

    return stats
  }
}

// Exportar instância singleton
export const ideasService = IdeasService.getInstance()
