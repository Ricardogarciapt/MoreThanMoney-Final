"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, RefreshCw, Save, Zap } from "lucide-react"

/**
 * Trailing por estratégia — o mesmo painel para MTM Auto, Tap to Trade e providers.
 *
 * As três coisas são a mesma tabela (`mtmauto_providers`), e é por isso que estão no mesmo ecrã:
 * separá-las por abas dava a impressão de haver três configurações quando há uma.
 */

interface Estrategia {
  id: string
  slug: string
  nome: string
  tipo: string
  ativo: boolean
  trailing_tempo_real: boolean
  trailing_arranca_pips: number | null
  trailing_distancia_pips: number | null
  trailing_passo_pips: number | null
}

/** O que cada tipo é, em palavras de quem usa e não de quem escreveu a tabela. */
const ONDE: Record<string, string> = {
  mtm_t2t: "Tap to Trade",
  metaapi: "Conta provider",
}

export function TrailingEstrategias() {
  const [linhas, setLinhas] = useState<Estrategia[]>([])
  const [carregar, setCarregar] = useState(true)
  const [aGuardar, setAGuardar] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const buscar = useCallback(async () => {
    setCarregar(true)
    try {
      const r = await fetch("/api/admin/mtmcopy/trailing-estrategias", { cache: "no-store" })
      const j = await r.json()
      if (j.ok) setLinhas(j.estrategias as Estrategia[])
      else setErro(j.erro ?? "Não foi possível ler as estratégias")
    } catch {
      setErro("Não foi possível ler as estratégias")
    }
    setCarregar(false)
  }, [])

  useEffect(() => { void buscar() }, [buscar])

  const mexer = (id: string, campo: keyof Estrategia, valor: unknown) =>
    setLinhas((l) => l.map((e) => (e.id === id ? { ...e, [campo]: valor } as Estrategia : e)))

  const guardar = async (e: Estrategia) => {
    setAGuardar(e.id)
    setErro(null)
    try {
      const r = await fetch("/api/admin/mtmcopy/trailing-estrategias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: e.id,
          trailing_tempo_real: e.trailing_tempo_real,
          trailing_arranca_pips: e.trailing_arranca_pips,
          trailing_distancia_pips: e.trailing_distancia_pips,
          trailing_passo_pips: e.trailing_passo_pips,
        }),
      })
      const j = await r.json()
      if (!j.ok) setErro(j.erro ?? "Não guardou")
    } catch {
      setErro("Não guardou")
    }
    setAGuardar(null)
  }

  const campo = (e: Estrategia, k: keyof Estrategia, rotulo: string, ajuda: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{rotulo}</span>
      <input
        type="number"
        min={0}
        step="0.1"
        value={(e[k] as number | null) ?? ""}
        placeholder="auto"
        onChange={(ev) => mexer(e.id, k, ev.target.value === "" ? null : Number(ev.target.value))}
        className="w-24 rounded-md border bg-background px-2 py-1 text-sm"
      />
      <span className="text-[10px] text-muted-foreground">{ajuda}</span>
    </label>
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4" /> Trailing por estratégia
        </CardTitle>
        <Button variant="outline" size="sm" onClick={() => void buscar()} disabled={carregar}>
          {carregar ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          As mesmas estratégias que a app MTM Auto mostra no admin — é a mesma linha na base, não
          uma cópia. Campos vazios seguem o automático: o arranque e a distância passam a ser uma
          fração do risco da própria trade, que é o que serve stops largos e curtos sem os obrigar
          à mesma regra.
        </p>

        {erro && <p className="text-xs text-red-500">{erro}</p>}

        <div className="space-y-3">
          {linhas.map((e) => (
            <div key={e.id} className="rounded-lg border p-3">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="font-medium">{e.nome}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {ONDE[e.tipo] ?? e.tipo}
                </span>
                {!e.ativo && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">inativa</span>
                )}
              </div>

              <div className="flex flex-wrap items-end gap-4">
                <label className="flex max-w-md cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={e.trailing_tempo_real}
                    onChange={(ev) => mexer(e.id, "trailing_tempo_real", ev.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    <span className="text-sm">O trailing segue o preço ao vivo</span>
                    <span className="block text-[11px] text-muted-foreground">
                      Lê o preço a cada passagem em vez do instantâneo que vem com a posição — que
                      pode ter segundos. Vale a pena em scalp; em swing só custa chamadas.
                    </span>
                  </span>
                </label>

                {campo(e, "trailing_arranca_pips", "Arranca a", "pips de lucro")}
                {campo(e, "trailing_distancia_pips", "Distância", "pips atrás do preço")}
                {campo(e, "trailing_passo_pips", "Passo mínimo", "pips para mexer")}

                <Button size="sm" onClick={() => void guardar(e)} disabled={aGuardar === e.id}>
                  {aGuardar === e.id ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-1 h-3.5 w-3.5" />
                  )}
                  Guardar
                </Button>
              </div>
            </div>
          ))}
          {!carregar && !linhas.length && (
            <p className="text-sm text-muted-foreground">Não há estratégias configuradas.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
