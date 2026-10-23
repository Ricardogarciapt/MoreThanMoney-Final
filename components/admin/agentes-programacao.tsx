"use client"

/**
 * AS PROGRAMAÇÕES DOS AGENTES — quando e quanto cada um acorda.
 *
 * A equipa: horas de trabalho, horas para contactar o dono, ritmos e tetos do modo antigo, e o teto
 * da quota diária do OS v2. Cada agente: ritmo e horas próprios (vazio = os da equipa). O motor do
 * AIOS lê isto a cada minuto; a validação vive no servidor (`lib/agentes/programacao.ts`).
 */

import { useEffect, useState } from "react"
import { CalendarClock } from "lucide-react"
import {
  Aviso, Botao, BotaoLer, Gaveta, Painel, Pilula, Tabela, Vazio,
  fmtQuando, pedirCentro, td, th, useCentro,
} from "@/components/admin/centro/ui"

type Campo = { chave: string; rotulo: string; ajuda: string; tipo: "minutos" | "numero" | "horas"; min: number; max: number }
type Agente = {
  id: string; nome: string; pilar: string; ceo: boolean; estado: string; pausado: boolean; ciclo: string | null
  recursos_mult: number; proprio: { ritmo_min?: number; horas_trabalho?: [number, number] }
  ultimo_ciclo: string | null; ciclos_hoje: number
}
type Dados = {
  ok: boolean; osV2Ligado: boolean; campos: Campo[]; globais: Record<string, unknown>
  quota: { valor: number; max: number }; ritmosPorCiclo: Record<string, number>; agentes: Agente[]
}

const horas = (v: unknown) => (Array.isArray(v) && v.length === 2 ? `${v[0]}h–${v[1]}h` : "—")

/** O ritmo que vale para este agente, como o motor o calcula. */
function ritmoEfectivo(a: Agente, d: Dados): { min: number; origem: string } {
  if (a.proprio.ritmo_min) return { min: a.proprio.ritmo_min, origem: "próprio" }
  if (d.osV2Ligado) {
    if (a.ceo) return { min: 60, origem: "CEO" }
    const r = d.ritmosPorCiclo[a.ciclo ?? ""] ?? 0
    const m = Math.min(3, Math.max(0.25, a.recursos_mult || 1))
    return { min: r ? Math.max(10, Math.round(r / m)) : 0, origem: `ciclo ${a.ciclo ?? "—"}` }
  }
  const g = Number(d.globais[a.ceo ? "ritmo_ceo_min" : "ritmo_filho_min"] ?? (a.ceo ? 60 : 180))
  return { min: g, origem: "equipa" }
}

export default function AgentesProgramacao() {
  const { dados: d, erro, aCarregar, recarregar, lidoEm } = useCentro<Dados>("/api/admin/agentes/programacao", 30_000)
  const [rascunho, setRascunho] = useState<Record<string, string>>({})
  const [quota, setQuota] = useState("")
  const [alvo, setAlvo] = useState<Agente | null>(null)
  const [ritmo, setRitmo] = useState("")
  const [hIni, setHIni] = useState("")
  const [hFim, setHFim] = useState("")
  const [ocupado, setOcupado] = useState(false)
  const [nota, setNota] = useState<{ tom: "info" | "grave"; txt: string } | null>(null)

  // O rascunho começa nos valores gravados, e só se reinicia quando eles mudam.
  const assinatura = d ? JSON.stringify([d.globais, d.quota.valor]) : ""
  useEffect(() => {
    if (!d) return
    const r: Record<string, string> = {}
    for (const c of d.campos) {
      const v = d.globais[c.chave]
      if (c.tipo === "horas") { r[`${c.chave}.0`] = Array.isArray(v) ? String(v[0]) : ""; r[`${c.chave}.1`] = Array.isArray(v) ? String(v[1]) : "" }
      else r[c.chave] = v == null ? "" : String(v)
    }
    setRascunho(r)
    setQuota(String(d.quota.valor))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura])

  const pedir = async (corpo: Record<string, unknown>) => {
    setOcupado(true)
    const r = await pedirCentro<{ ok: boolean; porque?: string }>("/api/admin/agentes/programacao", { method: "POST", body: corpo })
    setOcupado(false)
    if (!r.success) { setNota({ tom: "grave", txt: r.error ?? "Não foi possível." }); return false }
    setNota({ tom: "info", txt: r.data?.porque ?? "Gravado." })
    void recarregar()
    return true
  }

  const gravarEquipa = () => {
    if (!d) return
    const mudancas: Record<string, unknown> = {}
    for (const c of d.campos) {
      if (c.tipo === "horas") {
        const a = rascunho[`${c.chave}.0`], b = rascunho[`${c.chave}.1`]
        if (a !== "" && b !== "") mudancas[c.chave] = [Number(a), Number(b)]
      } else if (rascunho[c.chave] !== "" && rascunho[c.chave] != null) mudancas[c.chave] = Number(rascunho[c.chave])
    }
    void pedir({ acao: "globais", mudancas })
  }

  const abrir = (a: Agente) => {
    setAlvo(a)
    setRitmo(a.proprio.ritmo_min ? String(a.proprio.ritmo_min) : "")
    setHIni(a.proprio.horas_trabalho ? String(a.proprio.horas_trabalho[0]) : "")
    setHFim(a.proprio.horas_trabalho ? String(a.proprio.horas_trabalho[1]) : "")
  }

  const gravarAgente = async () => {
    if (!alvo) return
    const ok = await pedir({
      acao: "agente", id: alvo.id,
      ritmo_min: ritmo === "" ? null : Number(ritmo),
      horas_trabalho: hIni === "" || hFim === "" ? null : [Number(hIni), Number(hFim)],
    })
    if (ok) setAlvo(null)
  }

  const input = "w-full rounded-md border border-white/10 bg-zinc-900 px-2 py-1 font-mono text-[12px] text-white"

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-[12px] text-zinc-400">
          Quando e quanto os agentes acordam. O motor do AIOS lê isto a cada minuto, não é preciso reiniciar nada.
          {d && <> OS v2 <span className={d.osV2Ligado ? "text-emerald-300" : "text-zinc-500"}>{d.osV2Ligado ? "ligado" : "desligado"}</span>: {d.osV2Ligado ? "o ritmo sai do ciclo de cada agente e a quota diária manda no total." : "valem os ritmos e tetos do modo antigo."}</>}
        </p>
        <BotaoLer onClick={() => void recarregar()} aCarregar={aCarregar} lidoEm={lidoEm} />
      </div>

      {erro && <Aviso tom="grave">{erro}</Aviso>}
      {nota && <Aviso tom={nota.tom}>{nota.txt}</Aviso>}

      <Painel titulo="A equipa" icone={<CalendarClock className="h-3.5 w-3.5 text-[#D2A63C]" />}
        accao={<Botao tom="ouro" onClick={gravarEquipa} disabled={!d || ocupado}>{ocupado ? "…" : "Gravar"}</Botao>}>
        {!d ? <Vazio>A ler…</Vazio> : (
          <div className="grid gap-3 sm:grid-cols-2">
            {d.campos.map((c) => (
              <div key={c.chave} className="rounded-lg border border-white/[0.06] bg-zinc-900/40 p-2.5">
                <p className="text-[11.5px] text-zinc-200">{c.rotulo}</p>
                <p className="mb-1.5 text-[10.5px] text-zinc-500">{c.ajuda}</p>
                {c.tipo === "horas" ? (
                  <div className="flex items-center gap-1.5">
                    <input inputMode="numeric" className={input} value={rascunho[`${c.chave}.0`] ?? ""} onChange={(e) => setRascunho({ ...rascunho, [`${c.chave}.0`]: e.target.value })} />
                    <span className="text-zinc-500">até</span>
                    <input inputMode="numeric" className={input} value={rascunho[`${c.chave}.1`] ?? ""} onChange={(e) => setRascunho({ ...rascunho, [`${c.chave}.1`]: e.target.value })} />
                  </div>
                ) : (
                  <input inputMode="numeric" className={input} value={rascunho[c.chave] ?? ""} placeholder={`${c.min}–${c.max}`} onChange={(e) => setRascunho({ ...rascunho, [c.chave]: e.target.value })} />
                )}
              </div>
            ))}
            <div className="rounded-lg border border-[#D2A63C]/20 bg-zinc-900/40 p-2.5">
              <p className="text-[11.5px] text-zinc-200">Teto da quota diária (OS v2)</p>
              <p className="mb-1.5 text-[10.5px] text-zinc-500">Máximo de ciclos da equipa por dia. Nunca passa de {d.quota.max}.</p>
              <div className="flex gap-1.5">
                <input inputMode="numeric" className={input} value={quota} onChange={(e) => setQuota(e.target.value)} />
                <Botao onClick={() => void pedir({ acao: "quota", valor: Number(quota) })} disabled={ocupado}>Gravar</Botao>
              </div>
            </div>
          </div>
        )}
      </Painel>

      <Painel titulo="Cada agente" sub="Ritmo e horas próprios. Vazio = os da equipa (ou do ciclo, no OS v2).">
        {!d ? <Vazio>A ler…</Vazio> : d.agentes.length === 0 ? <Vazio>Ainda não há agentes.</Vazio> : (
          <Tabela min={760}>
            <thead>
              <tr>
                <th className={th}>Agente</th>
                <th className={th}>Ritmo</th>
                <th className={th}>Horas</th>
                <th className={th}>Último ciclo</th>
                <th className={th}>Hoje</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {d.agentes.map((a) => {
                const r = ritmoEfectivo(a, d)
                return (
                  <tr key={a.id}>
                    <td className={td}>
                      <p className="text-white">{a.nome}</p>
                      <p className="text-[10.5px] text-zinc-500">{a.pilar}{a.ciclo ? ` · ${a.ciclo}` : ""}{a.pausado ? " · pausado" : ""}</p>
                    </td>
                    <td className={`${td} font-mono`}>
                      {r.min ? `${r.min} min` : "não acorda"} <span className="text-[10.5px] text-zinc-500">({r.origem})</span>
                    </td>
                    <td className={`${td} font-mono`}>
                      {a.proprio.horas_trabalho ? <Pilula tom="ouro">{horas(a.proprio.horas_trabalho)}</Pilula> : <span className="text-zinc-500">{horas(d.globais.horas_trabalho)}</span>}
                    </td>
                    <td className={`${td} font-mono text-[11px]`}>{a.ultimo_ciclo ? fmtQuando(a.ultimo_ciclo) : "—"}</td>
                    <td className={`${td} font-mono`}>{a.ciclos_hoje}</td>
                    <td className={`${td} text-right`}><Botao onClick={() => abrir(a)}>Programar</Botao></td>
                  </tr>
                )
              })}
            </tbody>
          </Tabela>
        )}
      </Painel>

      <Gaveta aberta={!!alvo} aoFechar={() => setAlvo(null)} largura="max-w-md" titulo={alvo ? `Programar ${alvo.nome}` : ""}
        sub="Deixa vazio para usar o da equipa.">
        {alvo && (
          <div className="space-y-3">
            <label className="block text-[11px] text-zinc-400">Acorda de quantos em quantos minutos (15–1440)
              <input inputMode="numeric" value={ritmo} onChange={(e) => setRitmo(e.target.value)} className={`mt-1 ${input}`} />
            </label>
            <div className="text-[11px] text-zinc-400">Só trabalha entre (horas de Lisboa, 0–24)
              <div className="mt-1 flex items-center gap-1.5">
                <input inputMode="numeric" value={hIni} onChange={(e) => setHIni(e.target.value)} className={input} />
                <span className="text-zinc-500">e</span>
                <input inputMode="numeric" value={hFim} onChange={(e) => setHFim(e.target.value)} className={input} />
              </div>
            </div>
            <p className="text-[10.5px] text-zinc-500">No OS v2 o ciclo continua a decidir SE o agente trabalha; o ritmo próprio só muda de quanto em quanto tempo.</p>
            <div className="flex justify-end gap-2">
              <Botao onClick={() => setAlvo(null)}>Cancelar</Botao>
              <Botao tom="ouro" onClick={() => void gravarAgente()} disabled={ocupado}>{ocupado ? "…" : "Gravar"}</Botao>
            </div>
          </div>
        )}
      </Gaveta>
    </div>
  )
}
