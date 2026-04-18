"use client"

import { useAppStore } from '@mtm-auto/lib/store'
import { User, Mail, Calendar, DollarSign, Shield, MoreVertical, Search, UserPlus, Filter } from "lucide-react"
import { useState } from "react"

export function AdminClientsPanel() {
  const { clients, updateClient } = useAppStore()
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  const filteredClients = clients.filter(client => {
    const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          client.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === "all" || client.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const toggleClientStatus = (clientId: string) => {
    const client = clients.find(c => c.id === clientId)
    if (client) {
      updateClient(clientId, { 
        status: client.status === "active" ? "suspended" : "active" 
      })
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--mtm-text)]">Gestao de Clientes</h1>
          <p className="text-[var(--mtm-text2)] mt-1">Gerencie todos os clientes da plataforma</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-[var(--mtm-green)] text-[var(--mtm-bg)] rounded-lg font-medium hover:opacity-90 transition-opacity">
          <UserPlus className="w-4 h-4" />
          Adicionar Cliente
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--mtm-text3)]" />
          <input
            type="text"
            placeholder="Buscar por nome ou email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[var(--mtm-bg3)] border border-[var(--mtm-border)] rounded-lg text-[var(--mtm-text)] placeholder:text-[var(--mtm-text3)] focus:outline-none focus:border-[var(--mtm-green)]"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[var(--mtm-text3)]" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-[var(--mtm-bg3)] border border-[var(--mtm-border)] rounded-lg text-[var(--mtm-text)] focus:outline-none focus:border-[var(--mtm-green)]"
          >
            <option value="all">Todos os Status</option>
            <option value="active">Ativos</option>
            <option value="suspended">Suspensos</option>
            <option value="pending">Pendentes</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 bg-[var(--mtm-bg2)] border border-[var(--mtm-border)] rounded-xl">
          <p className="text-[var(--mtm-text3)] text-sm">Total Clientes</p>
          <p className="text-2xl font-bold text-[var(--mtm-text)] mt-1">{clients.length}</p>
        </div>
        <div className="p-4 bg-[var(--mtm-bg2)] border border-[var(--mtm-border)] rounded-xl">
          <p className="text-[var(--mtm-text3)] text-sm">Ativos</p>
          <p className="text-2xl font-bold text-[var(--mtm-green)] mt-1">
            {clients.filter(c => c.status === "active").length}
          </p>
        </div>
        <div className="p-4 bg-[var(--mtm-bg2)] border border-[var(--mtm-border)] rounded-xl">
          <p className="text-[var(--mtm-text3)] text-sm">Suspensos</p>
          <p className="text-2xl font-bold text-[var(--mtm-red)] mt-1">
            {clients.filter(c => c.status === "suspended").length}
          </p>
        </div>
        <div className="p-4 bg-[var(--mtm-bg2)] border border-[var(--mtm-border)] rounded-xl">
          <p className="text-[var(--mtm-text3)] text-sm">Volume Total</p>
          <p className="text-2xl font-bold text-[var(--mtm-cyan)] mt-1">
            ${clients.reduce((acc, c) => acc + c.totalDeposited, 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Clients Table */}
      <div className="bg-[var(--mtm-bg2)] border border-[var(--mtm-border)] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-[var(--mtm-bg3)]">
            <tr>
              <th className="text-left p-4 text-[var(--mtm-text3)] text-sm font-medium">Cliente</th>
              <th className="text-left p-4 text-[var(--mtm-text3)] text-sm font-medium">Email</th>
              <th className="text-left p-4 text-[var(--mtm-text3)] text-sm font-medium">Grupo</th>
              <th className="text-left p-4 text-[var(--mtm-text3)] text-sm font-medium">Depositado</th>
              <th className="text-left p-4 text-[var(--mtm-text3)] text-sm font-medium">Cadastro</th>
              <th className="text-left p-4 text-[var(--mtm-text3)] text-sm font-medium">Status</th>
              <th className="text-right p-4 text-[var(--mtm-text3)] text-sm font-medium">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.map((client) => (
              <tr key={client.id} className="border-t border-[var(--mtm-border)] hover:bg-[var(--mtm-bg3)] transition-colors">
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--mtm-green)] to-[var(--mtm-cyan)] flex items-center justify-center">
                      <User className="w-5 h-5 text-[var(--mtm-bg)]" />
                    </div>
                    <span className="font-medium text-[var(--mtm-text)]">{client.name}</span>
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2 text-[var(--mtm-text2)]">
                    <Mail className="w-4 h-4" />
                    {client.email}
                  </div>
                </td>
                <td className="p-4">
                  <span className="px-2 py-1 bg-[var(--mtm-bg4)] rounded text-[var(--mtm-text2)] text-sm">
                    {client.group}
                  </span>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-1 text-[var(--mtm-green)]">
                    <DollarSign className="w-4 h-4" />
                    {client.totalDeposited.toLocaleString()}
                  </div>
                </td>
                <td className="p-4">
                  <div className="flex items-center gap-2 text-[var(--mtm-text2)]">
                    <Calendar className="w-4 h-4" />
                    {new Date(client.joinedAt).toLocaleDateString("pt-BR")}
                  </div>
                </td>
                <td className="p-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    client.status === "active" 
                      ? "bg-[var(--mtm-green)]/20 text-[var(--mtm-green)]"
                      : client.status === "suspended"
                      ? "bg-[var(--mtm-red)]/20 text-[var(--mtm-red)]"
                      : "bg-[var(--mtm-gold)]/20 text-[var(--mtm-gold)]"
                  }`}>
                    {client.status === "active" ? "Ativo" : client.status === "suspended" ? "Suspenso" : "Pendente"}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => toggleClientStatus(client.id)}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                        client.status === "active"
                          ? "bg-[var(--mtm-red)]/20 text-[var(--mtm-red)] hover:bg-[var(--mtm-red)]/30"
                          : "bg-[var(--mtm-green)]/20 text-[var(--mtm-green)] hover:bg-[var(--mtm-green)]/30"
                      }`}
                    >
                      {client.status === "active" ? "Suspender" : "Ativar"}
                    </button>
                    <button className="p-2 hover:bg-[var(--mtm-bg4)] rounded transition-colors">
                      <MoreVertical className="w-4 h-4 text-[var(--mtm-text3)]" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
