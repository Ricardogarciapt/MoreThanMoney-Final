"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, RefreshCw } from "lucide-react"

/**
 * EQUIDADE DA MTM — contas da casa (MTM Funded simuladas com conta_casa: mestres das estratégias,
 * espelhos e contas do dono). Só admin: mostra dinheiro. Nunca levar estes valores para ecrãs de
 * cliente — lá só pips e %.
 */

interface Grupo {
  chave: string
  contas: number
  saldoInicial: number
  saldo: number
  equity: number
  flutuante: number
  resultadoPct: number
  contribuicao: number
}

interface Resposta {
  disponivel: boolean
  motivo?: string
  total: Grupo | null
  porEstrategia: Grupo[]
  lidoEm?: string
}

const usd = (n: number) => n.toLocaleString("pt-PT", { style: "currency", currency: "USD", maximumFractionDigits: 2 })

export function EquidadeCasaCard() {
  const [dados, setDados] = useState<Resposta | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aCarregar, setACarregar] = useState(false)

  const carregar = useCallback(async () => {
    setACarregar(true)
    setErro(null)
    try {
      const r = await fetch("/api/admin/mtmfunded/equidade-casa", { cache: "no-store" })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setDados(await r.json())
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setACarregar(false)
    }
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Equidade da MTM · contas da casa (simuladas)</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => void carregar()} disabled={aCarregar} aria-label="Atualizar">
          {aCarregar ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">Só admin. Valores em dinheiro — para clientes só pips e %.</p>
        {erro && <p className="text-red-500">Erro: {erro}</p>}
        {dados && !dados.disponivel && <p className="text-muted-foreground">{dados.motivo}</p>}
        {dados?.total && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div><div className="text-xs text-muted-foreground">Contas</div><div className="font-semibold">{dados.total.contas}</div></div>
            <div><div className="text-xs text-muted-foreground">Saldo</div><div className="font-semibold">{usd(dados.total.saldo)}</div></div>
            <div><div className="text-xs text-muted-foreground">Equity</div><div className="font-semibold">{usd(dados.total.equity)}</div></div>
            <div><div className="text-xs text-muted-foreground">Flutuante</div><div className={`font-semibold ${dados.total.flutuante < 0 ? "text-red-500" : "text-emerald-500"}`}>{usd(dados.total.flutuante)}</div></div>
          </div>
        )}
        {!!dados?.porEstrategia?.length && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-2">Estratégia</th><th className="pr-2">Contas</th><th className="pr-2">Saldo</th>
                  <th className="pr-2">Equity</th><th className="pr-2">Flutuante</th><th className="pr-2">Resultado</th><th>Conta p/ equidade</th>
                </tr>
              </thead>
              <tbody>
                {dados.porEstrategia.map((g) => (
                  <tr key={g.chave} className="border-t border-border/50">
                    <td className="py-1 pr-2 font-medium">{g.chave}</td>
                    <td className="pr-2">{g.contas}</td>
                    <td className="pr-2">{usd(g.saldo)}</td>
                    <td className="pr-2">{usd(g.equity)}</td>
                    <td className={`pr-2 ${g.flutuante < 0 ? "text-red-500" : ""}`}>{usd(g.flutuante)}</td>
                    <td className="pr-2">{g.resultadoPct.toFixed(2)}%</td>
                    <td>{usd(g.contribuicao)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
