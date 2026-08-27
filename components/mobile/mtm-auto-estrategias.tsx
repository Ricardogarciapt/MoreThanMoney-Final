"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { Loader2, TrendingUp } from "lucide-react"

/**
 * O que seguir — igual ao ecrã de Estratégias da app MTM Auto.
 *
 * Substitui os "chips" de fontes que estavam aqui antes. Aqueles eram uma segunda configuração,
 * ao lado da que já existia na MTM Auto, e duas telas a decidir a mesma coisa acabam sempre por
 * discordar — normalmente no dia em que um sinal não abre e ninguém percebe qual das duas mandou.
 *
 * Cada estratégia mostra o histórico REAL dela, calculado no MTM Auto a partir dos sinais deste
 * produto. Seguir aqui é seguir lá: é a mesma subscrição, na mesma tabela.
 *
 * O que NÃO se faz aqui é ligar a cópia automática — a rota força `autoAceitar: false`. Seguir
 * é escolher o que se quer VER para aceitar à mão; a cópia automática é a parte paga.
 */
type Provedor = {
  id: string
  nome: string
  descricao: string | null
  segue: boolean
  automatico?: boolean
  sinais?: number
  acerto?: number | null
  pips?: number | null
}

/** Um interruptor que diz o estado pela COR: verde a seguir, vermelho a não seguir. */
function Interruptor({ ligado, ocupado, onClick }: { ligado: boolean; ocupado: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={ocupado}
      role="switch"
      aria-checked={ligado}
      className="flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-3 pr-1.5 text-[12px] font-bold disabled:opacity-50"
      style={{
        border: `1px solid ${ligado ? "rgba(40,200,120,0.45)" : "rgba(255,77,77,0.40)"}`,
        background: ligado ? "rgba(40,200,120,0.12)" : "rgba(255,77,77,0.10)",
        color: ligado ? "#28C878" : "#FF4D4D",
      }}
    >
      {ocupado ? "…" : ligado ? "A seguir" : "Parado"}
      <span
        className="relative block h-5 w-9 rounded-full transition-colors"
        style={{ background: ligado ? "#28C878" : "#FF4D4D" }}
      >
        <span
          className="absolute top-0.5 block h-4 w-4 rounded-full bg-white transition-transform"
          style={{ left: ligado ? "1.125rem" : "0.125rem" }}
        />
      </span>
    </button>
  )
}

export default function MtmAutoEstrategias({
  fontes = [],
  onToggleFonte,
  porGuardar = false,
  aGuardarFontes = false,
  onGuardarFontes,
}: {
  /** As fontes Tap to Trade ATIVAS, e se a pessoa as está a receber. */
  fontes?: { key: string; label: string; ligada: boolean }[]
  onToggleFonte?: (key: string) => void
  porGuardar?: boolean
  aGuardarFontes?: boolean
  onGuardarFontes?: () => void
} = {}) {
  const [provs, setProvs] = useState<Provedor[]>([])
  const [aCarregar, setACarregar] = useState(true)
  const [aMudar, setAMudar] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token ?? null, [])

  const carregar = useCallback(async () => {
    setACarregar(true)
    try {
      const tok = await token()
      if (!tok) return
      const r = await fetch("/api/mtm-auto/estrategias", {
        headers: { Authorization: `Bearer ${tok}` },
        cache: "no-store",
      })
      const j = await r.json()
      setProvs(
        (j.providers ?? []).map((p: Record<string, unknown>) => ({
          id: String(p.id),
          nome: String(p.nome ?? ""),
          descricao: (p.descricao as string) ?? null,
          segue: p.segue === true || p.seguido === true,
          automatico: p.automatico === true || p.autoAceitar === true,
          sinais: Number(p.sinais ?? p.total ?? 0),
          acerto: p.acerto != null ? Number(p.acerto) : p.winRate != null ? Number(p.winRate) : null,
          pips: p.pips != null ? Number(p.pips) : null,
        })),
      )
    } catch {
      /* sem catálogo, o resto do separador continua a funcionar */
    } finally {
      setACarregar(false)
    }
  }, [token])

  useEffect(() => { carregar() }, [carregar])

  const alternar = async (p: Provedor) => {
    setAMudar(p.id)
    setAviso(null)
    try {
      const tok = await token()
      const r = await fetch("/api/mtm-auto/estrategias", {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: p.id, seguir: !p.segue }),
      })
      const j = await r.json()
      if (j.error) throw new Error(j.error)
      setProvs((xs) => xs.map((x) => (x.id === p.id ? { ...x, segue: !p.segue } : x)))
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "Não foi possível guardar.")
    } finally {
      setAMudar(null)
    }
  }

  /**
   * As FONTES do Tap to Trade aparecem sempre.
   *
   * Só as estratégias do MTM Auto exigem Premium/VIP. Pôr as duas atrás do mesmo cadeado tirava
   * a um cliente com conta T2T ativa a única forma de escolher o que recebe — e ele continua a
   * poder aceitar sinais, portanto continua a precisar de escolher.
   */
  if (aCarregar && !provs.length && !fontes.length) {
    return (
      <p className="flex items-center justify-center gap-2 py-10 text-[13px] text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin text-[#D2A63C]" /> A ler as estratégias…
      </p>
    )
  }

  if (!provs.length && !fontes.length) {
    return <p className="py-10 text-center text-[13px] text-zinc-500">Sem fontes nem estratégias disponíveis.</p>
  }

  return (
    <div className="space-y-2">
      <p className="px-1 text-[12px] leading-snug text-zinc-400">
        Escolhe o que queres seguir. Verde é a receber; vermelho é parado. Os sinais do que segues
        aparecem no separador Sinais, para aceitares um a um. Ligar a cópia automática faz-se na
        app MTM Auto.
      </p>

      {/* AS FONTES TAP TO TRADE ATIVAS.
          São as fontes que estão mesmo ligadas no sistema — não uma lista fixa. Uma lista fixa
          ofereceria fontes desligadas, e deixar alguém seguir o que não existe é prometer sinais
          que nunca chegam. */}
      {fontes.length > 0 && (
        <>
          <p className="px-1 pt-1 text-[11px] uppercase tracking-wider text-zinc-500">Fontes Tap to Trade</p>
          {fontes.map((f) => (
            <div
              key={f.key}
              className="flex items-center justify-between gap-3 rounded-2xl border p-3"
              style={{ borderColor: f.ligada ? "rgba(40,200,120,0.30)" : "#23262F", background: "#12141A" }}
            >
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-white">{f.label}</p>
                <p className="mt-0.5 text-[11.5px] text-zinc-500">
                  {f.ligada ? "Recebes os sinais desta fonte" : "Não recebes os sinais desta fonte"}
                </p>
              </div>
              <Interruptor ligado={f.ligada} ocupado={aGuardarFontes} onClick={() => onToggleFonte?.(f.key)} />
            </div>
          ))}
          {porGuardar && (
            <button
              onClick={onGuardarFontes}
              disabled={aGuardarFontes}
              className="w-full rounded-xl bg-[#D2A63C] py-2.5 text-[13px] font-bold text-black disabled:opacity-50"
            >
              {aGuardarFontes ? "A guardar…" : "Guardar alterações"}
            </button>
          )}
          {provs.length > 0 && (
            <p className="px-1 pt-2 text-[11px] uppercase tracking-wider text-zinc-500">Estratégias MTM Auto</p>
          )}
        </>
      )}

      {provs.length === 0 && fontes.length > 0 && (
        <p className="px-1 py-2 text-[12px] leading-snug text-zinc-500">
          As estratégias do MTM Auto são para membros Premium e VIP. As fontes acima continuam
          tuas e a funcionar no Tap to Trade.
        </p>
      )}

      {provs.map((p) => (
        <div
          key={p.id}
          className="rounded-2xl border p-3"
          style={{ borderColor: p.segue ? "rgba(40,200,120,0.30)" : "#23262F", background: "#12141A" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-white">{p.nome}</p>
              {p.descricao && <p className="mt-0.5 text-[12px] leading-snug text-zinc-400">{p.descricao}</p>}
              {Boolean(p.sinais) && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-zinc-500">
                  <TrendingUp className="h-3 w-3" />
                  {p.sinais} sinais
                  {p.acerto != null && ` · ${p.acerto}% de acerto`}
                  {p.pips != null && ` · ${p.pips >= 0 ? "+" : ""}${p.pips} pips`}
                </p>
              )}
              {p.automatico && (
                <p className="mt-1 text-[11.5px] text-[#D2A63C]">Cópia automática ligada na app MTM Auto</p>
              )}
            </div>
            <Interruptor ligado={p.segue} ocupado={aMudar === p.id} onClick={() => alternar(p)} />
          </div>
        </div>
      ))}

      {aviso && <p className="rounded-xl border border-zinc-800 p-2.5 text-[12.5px] text-rose-400">{aviso}</p>}
    </div>
  )
}
