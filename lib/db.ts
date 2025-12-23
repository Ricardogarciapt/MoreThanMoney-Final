// Simulação de base de dados para desenvolvimento
// Em produção, isto será substituído pelo Supabase

interface DatabaseRecord {
  id: string
  [key: string]: any
}

class MockDatabase {
  private data: Map<string, Map<string, DatabaseRecord>> = new Map()

  constructor() {
    // Inicializar tabelas
    this.data.set("products", new Map())
    this.data.set("users", new Map())
    this.data.set("telegram_signals", new Map())
    this.data.set("orders", new Map())
  }

  async getAll<T extends DatabaseRecord>(table: string): Promise<T[]> {
    const tableData = this.data.get(table)
    if (!tableData) return []
    return Array.from(tableData.values()) as T[]
  }

  async getById<T extends DatabaseRecord>(table: string, id: string): Promise<T | null> {
    const tableData = this.data.get(table)
    if (!tableData) return null
    return (tableData.get(id) as T) || null
  }

  async create<T extends DatabaseRecord>(table: string, record: T): Promise<T> {
    const tableData = this.data.get(table) || new Map()
    tableData.set(record.id, record)
    this.data.set(table, tableData)
    return record
  }

  async update<T extends DatabaseRecord>(table: string, id: string, updates: Partial<T>): Promise<T | null> {
    const tableData = this.data.get(table)
    if (!tableData) return null

    const existing = tableData.get(id)
    if (!existing) return null

    const updated = { ...existing, ...updates }
    tableData.set(id, updated)
    return updated as T
  }

  async delete(table: string, id: string): Promise<boolean> {
    const tableData = this.data.get(table)
    if (!tableData) return false
    return tableData.delete(id)
  }

  async query<T extends DatabaseRecord>(table: string, conditions: Record<string, any>): Promise<T[]> {
    const tableData = this.data.get(table)
    if (!tableData) return []

    const records = Array.from(tableData.values())
    return records.filter((record) => {
      return Object.entries(conditions).every(([key, value]) => record[key] === value)
    }) as T[]
  }
}

export const db = new MockDatabase()
