// Serviço para gerenciar operações de copytrading
import { useConfigStore } from "./config-service"

// Tipos
export interface CopytradingAccount {
  userId: string
  brokerName: string
  serverName: string
  accountNumber: string
  status: "active" | "pending" | "error" | "disabled"
  lastSync: string
  riskSettings: {
    maxVolume: string
    maxDrawdown: string
    useStopLoss: boolean
    useTakeProfit: boolean
    copyRatio: string
  }
}

export interface TradeOperation {
  id: string
  symbol: string
  type: "buy" | "sell"
  openTime: string
  closeTime?: string
  openPrice: number
  closePrice?: number
  volume: number
  stopLoss?: number
  takeProfit?: number
  profit?: number
  status: "open" | "closed" | "pending"
}

// Classe de serviço
export class CopytradingService {
  private static instance: CopytradingService
  private accounts: CopytradingAccount[] = []
  private operations: TradeOperation[] = []
  private syncInterval: NodeJS.Timeout | null = null

  private constructor() {
    // Carregar contas do localStorage se disponível
    if (typeof window !== "undefined") {
      const savedAccounts = localStorage.getItem("copytrading_accounts")
      if (savedAccounts) {
        try {
          this.accounts = JSON.parse(savedAccounts)
        } catch (e) {
          console.error("Erro ao carregar contas de copytrading:", e)
        }
      }

      const savedOperations = localStorage.getItem("copytrading_operations")
      if (savedOperations) {
        try {
          this.operations = JSON.parse(savedOperations)
        } catch (e) {
          console.error("Erro ao carregar operações de copytrading:", e)
        }
      }
    }
  }

  // Singleton pattern
  public static getInstance(): CopytradingService {
    if (!CopytradingService.instance) {
      CopytradingService.instance = new CopytradingService()
    }
    return CopytradingService.instance
  }

  // Iniciar o serviço de copytrading
  public startService(): void {
    const { config } = useConfigStore.getState()

    if (!config.copytrading?.enabled) {
      console.log("Serviço de copytrading está desativado nas configurações")
      return
    }

    console.log("Iniciando serviço de copytrading...")

    // Iniciar sincronização periódica
    if (!this.syncInterval) {
      this.syncInterval = setInterval(() => this.syncTrades(), 60000) // Sincronizar a cada minuto
    }

    // Sincronizar imediatamente
    this.syncTrades()
  }

  // Parar o serviço de copytrading
  public stopService(): void {
    console.log("Parando serviço de copytrading...")

    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
  }

  // Registrar uma nova conta para copytrading
  public registerAccount(account: Omit<CopytradingAccount, "status" | "lastSync">): CopytradingAccount {
    const newAccount: CopytradingAccount = {
      ...account,
      status: "pending",
      lastSync: new Date().toISOString(),
    }

    this.accounts.push(newAccount)
    this.saveAccounts()

    return newAccount
  }

  // Atualizar status de uma conta
  public updateAccountStatus(userId: string, status: CopytradingAccount["status"]): void {
    const account = this.accounts.find((acc) => acc.userId === userId)
    if (account) {
      account.status = status
      account.lastSync = new Date().toISOString()
      this.saveAccounts()
    }
  }

  // Atualizar configurações de risco de uma conta
  public updateRiskSettings(userId: string, riskSettings: CopytradingAccount["riskSettings"]): void {
    const account = this.accounts.find((acc) => acc.userId === userId)
    if (account) {
      account.riskSettings = riskSettings
      this.saveAccounts()
    }
  }

  // Obter todas as contas
  public getAccounts(): CopytradingAccount[] {
    return this.accounts
  }

  // Obter conta por ID de usuário
  public getAccountByUserId(userId: string): CopytradingAccount | undefined {
    return this.accounts.find((acc) => acc.userId === userId)
  }

  // Obter operações de uma conta
  public getOperationsByUserId(userId: string): TradeOperation[] {
    // Em um sistema real, isso filtraria operações específicas do usuário
    // Para simplificar, retornamos todas as operações
    return this.operations
  }

  // Sincronizar operações da conta mestre para as contas dos clientes
  private async syncTrades(): Promise<void> {
    const { config } = useConfigStore.getState()

    if (!config.copytrading?.enabled) {
      console.log("Copytrading desativado, sincronização ignorada")
      return
    }

    console.log("Sincronizando operações de copytrading...")

    try {
      // Em um sistema real, aqui você faria:
      // 1. Conectar à API do MetaTrader
      // 2. Obter operações da conta mestre
      // 3. Para cada conta de cliente ativa:
      //    a. Aplicar configurações de risco
      //    b. Copiar operações ajustadas para a conta do cliente

      // Simulação de operações para demonstração
      this.simulateTradeOperations()

      // Atualizar status das contas
      this.accounts.forEach((account) => {
        if (account.status === "pending") {
          account.status = "active"
        }
        account.lastSync = new Date().toISOString()
      })

      this.saveAccounts()
      this.saveOperations()

      console.log("Sincronização concluída com sucesso")
    } catch (error) {
      console.error("Erro durante a sincronização de copytrading:", error)
    }
  }

  // Simulação de operações para demonstração
  private simulateTradeOperations(): void {
    // Gerar algumas operações de exemplo
    const symbols = ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSD"]
    const now = new Date()

    // Adicionar uma nova operação aleatória
    if (Math.random() > 0.5 && this.operations.length < 20) {
      const newOperation: TradeOperation = {
        id: `op_${Date.now()}`,
        symbol: symbols[Math.floor(Math.random() * symbols.length)],
        type: Math.random() > 0.5 ? "buy" : "sell",
        openTime: new Date(now.getTime() - Math.random() * 86400000).toISOString(),
        openPrice: 1 + Math.random() * 1000,
        volume: 0.01 + Math.random() * 0.99,
        status: "open",
      }

      // Adicionar stop loss e take profit em algumas operações
      if (Math.random() > 0.3) {
        newOperation.stopLoss =
          newOperation.type === "buy" ? newOperation.openPrice * 0.99 : newOperation.openPrice * 1.01
      }

      if (Math.random() > 0.3) {
        newOperation.takeProfit =
          newOperation.type === "buy" ? newOperation.openPrice * 1.01 : newOperation.openPrice * 0.99
      }

      this.operations.push(newOperation)
    }

    // Fechar algumas operações abertas
    this.operations.forEach((op) => {
      if (op.status === "open" && Math.random() > 0.7) {
        op.status = "closed"
        op.closeTime = new Date().toISOString()
        op.closePrice = op.openPrice * (0.98 + Math.random() * 0.04)
        op.profit =
          op.type === "buy"
            ? (op.closePrice - op.openPrice) * op.volume * 100
            : (op.openPrice - op.closePrice) * op.volume * 100
      }
    })

    // Limitar o número de operações armazenadas
    if (this.operations.length > 50) {
      this.operations = this.operations.slice(-50)
    }
  }

  // Salvar contas no localStorage
  private saveAccounts(): void {
    if (typeof window !== "undefined") {
      localStorage.setItem("copytrading_accounts", JSON.stringify(this.accounts))
    }
  }

  // Salvar operações no localStorage
  private saveOperations(): void {
    if (typeof window !== "undefined") {
      localStorage.setItem("copytrading_operations", JSON.stringify(this.operations))
    }
  }
}

// Exportar instância singleton
export const copytradingService = CopytradingService.getInstance()
