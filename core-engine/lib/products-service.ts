// Serviço para gestão de produtos
import { db } from "./db" // Import the db variable

export interface Product {
  id: string
  name: string
  description: string
  price: number
  originalPrice?: number
  category: "course" | "scanner" | "copytrading" | "membership" | "automation"
  status: "active" | "inactive" | "draft"
  stock: number
  unlimited: boolean
  features: string[]
  images: string[]
  tags: string[]
  createdAt: Date
  updatedAt: Date
  metadata?: Record<string, any>
}

export interface ProductCategory {
  id: string
  name: string
  description: string
  slug: string
  parentId?: string
}

class ProductsService {
  private static instance: ProductsService

  public static getInstance(): ProductsService {
    if (!ProductsService.instance) {
      ProductsService.instance = new ProductsService()
    }
    return ProductsService.instance
  }

  // Obter todos os produtos
  async getAllProducts(): Promise<Product[]> {
    try {
      return await db.getAll<Product>("products")
    } catch (error) {
      console.error("Erro ao obter produtos:", error)
      return []
    }
  }

  // Obter produto por ID
  async getProductById(id: string): Promise<Product | null> {
    try {
      return await db.getById<Product>("products", id)
    } catch (error) {
      console.error("Erro ao obter produto:", error)
      return null
    }
  }

  // Criar novo produto
  async createProduct(productData: Omit<Product, "id" | "createdAt" | "updatedAt">): Promise<Product> {
    try {
      const product: Product = {
        ...productData,
        id: this.generateId(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      return await db.create<Product>("products", product)
    } catch (error) {
      console.error("Erro ao criar produto:", error)
      throw error
    }
  }

  // Atualizar produto
  async updateProduct(id: string, updates: Partial<Product>): Promise<Product | null> {
    try {
      return await db.update<Product>("products", id, {
        ...updates,
        updatedAt: new Date(),
      })
    } catch (error) {
      console.error("Erro ao atualizar produto:", error)
      throw error
    }
  }

  // Deletar produto
  async deleteProduct(id: string): Promise<boolean> {
    try {
      return await db.delete("products", id)
    } catch (error) {
      console.error("Erro ao deletar produto:", error)
      return false
    }
  }

  // Obter produtos por categoria
  async getProductsByCategory(category: string): Promise<Product[]> {
    try {
      return await db.query<Product>("products", { category })
    } catch (error) {
      console.error("Erro ao obter produtos por categoria:", error)
      return []
    }
  }

  // Obter produtos ativos
  async getActiveProducts(): Promise<Product[]> {
    try {
      return await db.query<Product>("products", { status: "active" })
    } catch (error) {
      console.error("Erro ao obter produtos ativos:", error)
      return []
    }
  }

  // Atualizar stock
  async updateStock(id: string, quantity: number): Promise<boolean> {
    try {
      const product = await this.getProductById(id)
      if (!product || product.unlimited) return true

      const newStock = Math.max(0, product.stock + quantity)
      await this.updateProduct(id, { stock: newStock })
      return true
    } catch (error) {
      console.error("Erro ao atualizar stock:", error)
      return false
    }
  }

  // Verificar disponibilidade
  async checkAvailability(id: string, quantity = 1): Promise<boolean> {
    try {
      const product = await this.getProductById(id)
      if (!product || product.status !== "active") return false
      if (product.unlimited) return true
      return product.stock >= quantity
    } catch (error) {
      console.error("Erro ao verificar disponibilidade:", error)
      return false
    }
  }

  // Exportar produtos para JSON
  async exportProducts(): Promise<string> {
    try {
      const products = await this.getAllProducts()
      return JSON.stringify(products, null, 2)
    } catch (error) {
      console.error("Erro ao exportar produtos:", error)
      throw error
    }
  }

  // Importar produtos de JSON
  async importProducts(jsonData: string): Promise<{ success: number; errors: string[] }> {
    try {
      const products = JSON.parse(jsonData) as Product[]
      const results = { success: 0, errors: [] as string[] }

      for (const productData of products) {
        try {
          // Remover ID para criar novo
          const { id, createdAt, updatedAt, ...data } = productData
          await this.createProduct(data)
          results.success++
        } catch (error) {
          results.errors.push(`Erro ao importar ${productData.name}: ${error}`)
        }
      }

      return results
    } catch (error) {
      console.error("Erro ao importar produtos:", error)
      throw error
    }
  }

  // Adicionar método para inicializar produtos padrão se não existirem
  async initializeDefaultProducts(): Promise<void> {
    try {
      const existingProducts = await this.getAllProducts()
      if (existingProducts.length > 0) return

      const defaultProducts: Omit<Product, "id" | "createdAt" | "updatedAt">[] = [
        {
          name: "Bootcamp MoreThanMoney",
          description: "Curso completo de trading e investimentos com mais de 50 horas de conteúdo premium",
          price: 497,
          originalPrice: 997,
          category: "course",
          status: "active",
          stock: 0,
          unlimited: true,
          features: [
            "Acesso vitalício ao curso",
            "Mais de 50 horas de conteúdo",
            "Suporte da comunidade VIP",
            "Certificado de conclusão",
            "Atualizações gratuitas",
            "Acesso ao grupo Telegram VIP",
          ],
          images: ["/bootcamp-mtm-screenshot.png"],
          tags: ["trading", "investimentos", "educação", "premium"],
          metadata: {
            duration: "50+ horas",
            level: "Iniciante a Avançado",
            language: "Português",
            support: "24/7",
          },
        },
        {
          name: "Scanner MTM Gold Killer",
          description: "Scanner avançado para identificar oportunidades de trading em ouro com precisão de 85%+",
          price: 97,
          originalPrice: 197,
          category: "scanner",
          status: "active",
          stock: 0,
          unlimited: true,
          features: [
            "Sinais em tempo real",
            "Análise técnica avançada",
            "Alertas personalizados",
            "Suporte 24/7",
            "Backtesting histórico",
            "Interface intuitiva",
          ],
          images: ["/scanner-preview.png"],
          tags: ["scanner", "ouro", "sinais", "automação"],
          metadata: {
            accuracy: "85%+",
            timeframes: "M1, M5, M15, H1, H4, D1",
            markets: "XAUUSD, Gold Futures",
            alerts: "Email, SMS, Telegram",
          },
        },
        {
          name: "Copytrading Premium VIP",
          description: "Acesso exclusivo aos melhores portfólios de copytrading com gestão de risco automática",
          price: 197,
          originalPrice: 397,
          category: "copytrading",
          status: "active",
          stock: 50,
          unlimited: false,
          features: [
            "Acesso a 10+ portfólios premium",
            "Gestão de risco automática",
            "Relatórios detalhados diários",
            "Suporte prioritário VIP",
            "Análise de performance",
            "Diversificação automática",
          ],
          images: ["/trading-animation.png"],
          tags: ["copytrading", "portfólios", "automação", "vip"],
          metadata: {
            minDeposit: "€500",
            expectedReturn: "15-25% anual",
            riskLevel: "Médio",
            traders: "10+ traders verificados",
          },
        },
        {
          name: "Membership MoreThanMoney VIP",
          description: "Acesso completo a todos os recursos da plataforma MoreThanMoney",
          price: 97,
          category: "membership",
          status: "active",
          stock: 0,
          unlimited: true,
          features: [
            "Acesso a todos os scanners",
            "Sinais VIP do Telegram",
            "Suporte prioritário",
            "Webinars exclusivos",
            "Análises de mercado diárias",
            "Comunidade VIP",
          ],
          images: ["/logo-mtm-transparent.png"],
          tags: ["membership", "vip", "acesso-completo"],
          metadata: {
            duration: "Mensal",
            renewal: "Automático",
            benefits: "Todos os recursos",
          },
        },
        {
          name: "MTM Gold Killer V2.1 - Anual",
          description:
            "Scanner avançado MTM Gold Killer com análise técnica por IA e algoritmos proprietários - Licença Anual",
          price: 150,
          category: "scanner",
          status: "active",
          stock: 0,
          unlimited: true,
          features: [
            "Algoritmos de análise por IA",
            "Detecção de tendência SuperTrend",
            "Alvo estatístico dinâmico",
            "Visualização multi-nível",
            "Personalização avançada",
            "Suporte técnico incluído",
          ],
          images: ["/scanner-preview.png"],
          tags: ["scanner", "gold", "ia", "algoritmos"],
          metadata: {
            duration: "12 meses",
            renewal: "Anual",
            accuracy: "85%+",
            markets: "XAUUSD, Gold Futures",
          },
        },
        {
          name: "MTM Gold Killer V2.1 - Vitalício",
          description:
            "Scanner avançado MTM Gold Killer com análise técnica por IA e algoritmos proprietários - Licença Vitalícia",
          price: 750,
          category: "scanner",
          status: "active",
          stock: 0,
          unlimited: true,
          features: [
            "Algoritmos de análise por IA",
            "Detecção de tendência SuperTrend",
            "Alvo estatístico dinâmico",
            "Visualização multi-nível",
            "Personalização avançada",
            "Suporte técnico vitalício",
            "Atualizações gratuitas",
          ],
          images: ["/scanner-preview.png"],
          tags: ["scanner", "gold", "ia", "vitalicio"],
          metadata: {
            duration: "Vitalício",
            renewal: "Nunca",
            accuracy: "85%+",
            markets: "XAUUSD, Gold Futures",
          },
        },
        {
          name: "Scanner MTM V3.4 - Anual",
          description: "Scanner MTM V3.4 com estruturas de mercado e ATR para análise técnica avançada - Licença Anual",
          price: 150,
          category: "scanner",
          status: "active",
          stock: 0,
          unlimited: true,
          features: [
            "Identificação de estruturas de mercado",
            "Cálculo de ATR para gestão de risco",
            "Sinais de entrada e saída otimizados",
            "Compatível com múltiplos timeframes",
            "Atualizações regulares",
            "Suporte dedicado",
          ],
          images: ["/scanner-preview.png"],
          tags: ["scanner", "mtm", "estruturas", "atr"],
          metadata: {
            duration: "12 meses",
            renewal: "Anual",
            timeframes: "M1, M5, M15, H1, H4, D1",
            markets: "Forex, Crypto, Stocks",
          },
        },
        {
          name: "Scanner MTM V3.4 - Vitalício",
          description:
            "Scanner MTM V3.4 com estruturas de mercado e ATR para análise técnica avançada - Licença Vitalícia",
          price: 750,
          category: "scanner",
          status: "active",
          stock: 0,
          unlimited: true,
          features: [
            "Identificação de estruturas de mercado",
            "Cálculo de ATR para gestão de risco",
            "Sinais de entrada e saída otimizados",
            "Compatível com múltiplos timeframes",
            "Atualizações vitalícias",
            "Suporte técnico vitalício",
            "Acesso prioritário a novos recursos",
          ],
          images: ["/scanner-preview.png"],
          tags: ["scanner", "mtm", "estruturas", "vitalicio"],
          metadata: {
            duration: "Vitalício",
            renewal: "Nunca",
            timeframes: "M1, M5, M15, H1, H4, D1",
            markets: "Forex, Crypto, Stocks",
          },
        },
      ]

      for (const product of defaultProducts) {
        await this.createProduct(product)
      }

      console.log("✅ Produtos padrão inicializados com sucesso")
    } catch (error) {
      console.error("❌ Erro ao inicializar produtos padrão:", error)
    }
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2)
  }
}

export const productsService = ProductsService.getInstance()
