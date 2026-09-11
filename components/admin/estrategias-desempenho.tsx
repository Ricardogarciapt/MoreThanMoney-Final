"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react"

/**
 * O DESEMPENHO DE CADA ESTRATÉGIA, para quem decide.
 *
 * A função que alimenta este painel é a mesma que serve a app MTM Auto, o MTM System e o site —
 * muda só o `admin: true`, que abre os saldos. Ter duas contas diferentes do mesmo número é o
 * que faz alguém deixar de acreditar em qualquer uma delas.
 *
 * Este ecrã mostra DE PROPÓSITO números que não se publicam. O admin precisa de ver a estratégia
 * como ela está, mesmo quando está mal — um painel que só mostra o que é bonito não serve para
 * decidir nada. O aviso do topo existe para que ninguém leve estes números daqui para uma página
 * de cliente sem saber o que eles são.
 */

interface Bloco {
  sinais: number
  pipsTotal: number
  pipsMedia: number
  acertoPct: number
  desde: string | null
  ate: string | null
  fiavel: boolean
  porqueNaoFiavel: string | null
}

interface Estrategia {
  slug: string
  nome: string
  ativo: boolean
  total: Bloco
  proveniencia: Array<{ fonte: string; sinais: number; pips: number; ate: string | null }>
  contaMestre: {
    login: string | null
    desde: string | null
    ligadaMetaApi: boolean
    estrategiaCf: string | null
    saldo?: number | null
    equity?: number | null
  } | null
  regras: {
    riscoPct: number | null
    bePips: number | null
    trailingPips: number | null
    saidasPct: number[] | null
    porque: string | null
  }
  subscritores: number
}

interface Equidade {
  contribuicao: number
  nominal: number
  contas: Array<{ login: string | null; valorNominal: number; contribuicao: number }>
}

const dinheiro = (n: number | null | undefined) =>
  n == null ? "—" : `${Math.round(n).toLocaleString("pt-PT")} USD`

const data = (s: string | null) => (s ? new Date(s).toLocaleDateString("pt-PT") : "—")

export function EstrategiasDesempenho() {
  const [linhas, setLinhas] = useState<Estrategia[]>([])
  const [equidade, setEquidade] = useState<Equidade | null>(null)
  const [carregar, setCarregar] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const buscar = useCallback(async () => {
    setCarregar(true)
    setErro(null)
    try {
      const r = await fetch("/api/admin/mtmcopy/estrategias-desempenho", { cache: "no-store" })
      const j = await r.json()
      if (r.ok) {
        setLinhas((j.estrategias ?? []) as Estrategia[])
        setEquidade((j.equidade ?? null) as Equidade | null)
      } else {
        setErro(j.error ?? "Não foi possível ler o desempenho")
      }
    } catch {
      setErro("Não foi possível ler o desempenho")
    }
    setCarregar(false)
  }, [])

  useEffect(() => { void buscar() }, [buscar])

  // Basta uma linha não fiável para o aviso valer para o painel todo — e hoje são todas.
  const naoFiavel = linhas.find((l) => !l.total.fiavel)?.total.porqueNaoFiavel ?? null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Desempenho por estratégia</CardTitle>
        <Button variant="outline" size="sm" onClick={() => void buscar()} disabled={carregar}>
          {carregar ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {erro && <p className="text-sm text-red-600">{erro}</p>}

        {naoFiavel && (
          <div className="flex gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[13px] leading-relaxed text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Estes números não se publicam.</p>
              <p className="mt-0.5">{naoFiavel}</p>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-3 font-medium">Estratégia</th>
                <th className="py-2 pr-3 text-right font-medium">Sinais</th>
                <th className="py-2 pr-3 text-right font-medium">Pips</th>
                <th className="py-2 pr-3 text-right font-medium">Acerto</th>
                <th className="py-2 pr-3 text-right font-medium">Subs.</th>
                <th className="py-2 pr-3 font-medium">Conta mestre</th>
                <th className="py-2 pr-3 text-right font-medium">Saldo</th>
                <th className="py-2 text-right font-medium">Equity</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((e) => (
                <tr key={e.slug} className="border-b last:border-0 align-top">
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${e.ativo ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                        title={e.ativo ? "a correr" : "pausada"}
                      />
                      <span className="font-medium">{e.nome}</span>
                    </div>
                    {e.total.desde && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {data(e.total.desde)} — {data(e.total.ate)}
                      </p>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{e.total.sinais || "—"}</td>
                  <td
                    className={`py-2.5 pr-3 text-right tabular-nums ${
                      e.total.pipsTotal > 0 ? "text-emerald-600" : e.total.pipsTotal < 0 ? "text-red-600" : ""
                    }`}
                  >
                    {e.total.sinais ? Math.round(e.total.pipsTotal).toLocaleString("pt-PT") : "—"}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">
                    {e.total.sinais ? `${e.total.acertoPct}%` : "—"}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{e.subscritores}</td>
                  <td className="py-2.5 pr-3">
                    {e.contaMestre ? (
                      <>
                        <span className="tabular-nums">{e.contaMestre.login ?? "—"}</span>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {e.contaMestre.ligadaMetaApi ? "MetaApi" : "sem MetaApi"}
                          {e.contaMestre.estrategiaCf ? ` · ${e.contaMestre.estrategiaCf}` : " · sem CopyFactory"}
                        </p>
                      </>
                    ) : (
                      <span className="text-muted-foreground">sem conta</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{dinheiro(e.contaMestre?.saldo)}</td>
                  <td className="py-2.5 text-right tabular-nums">{dinheiro(e.contaMestre?.equity)}</td>
                </tr>
              ))}
              {!linhas.length && !carregar && (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-muted-foreground">
                    Sem estratégias.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {equidade && (
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-[13px] font-medium">Contas financiadas na equidade MTM</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {equidade.contas.length} conta{equidade.contas.length === 1 ? "" : "s"} · nominal{" "}
              {dinheiro(equidade.nominal)} · entra na equidade por{" "}
              <span className="font-medium text-foreground">{dinheiro(equidade.contribuicao)}</span>{" "}
              (10% do valor integral).
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
