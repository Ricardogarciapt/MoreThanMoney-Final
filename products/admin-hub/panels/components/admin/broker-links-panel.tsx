"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * Painel dos LINKS DE CORRETORA — a pool e a rotação.
 *
 * Existe para uma coisa que só se percebe quando falha: a corretora paga a quem recomenda, e um
 * link fixo no site faz com que todos os clientes contem sempre para a mesma pessoa. Aqui
 * põem-se os links de cada IB e o sistema dá um dia a cada um, à vez.
 *
 * A previsão dos próximos dias está à vista de propósito. Uma rotação que só se pode verificar
 * depois de acontecer é uma rotação em que ninguém confia — e quem não confia volta a espalhar o
 * link dele por fora.
 */
type Link = {
  id: string
  etiqueta: string
  url: string
  peso: number
  ativo: boolean
  cliques: number
  ultimo_uso: string | null
  notas: string | null
}
type Estado = {
  links: Link[]
  hoje: { url: string; id: string | null; etiqueta: string }
  proximos: { dia: string; etiqueta: string }[]
}

const card = "rounded-xl border border-neutral-800 bg-neutral-900/60 p-4"
const btn = "rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:opacity-40"
const input = "w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"

export function BrokerLinksPanel() {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [novo, setNovo] = useState({ etiqueta: "", url: "", peso: 1 })

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/broker-links", { cache: "no-store" })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || "erro")
      setEstado(j)
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro a carregar")
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const comando = async (corpo: Record<string, unknown>) => {
    setOcupado(true)
    try {
      const r = await fetch("/api/admin/broker-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || "falhou")
      await carregar()
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falhou")
    } finally {
      setOcupado(false)
    }
  }

  const total = (estado?.links ?? []).reduce((a, l) => a + (l.cliques || 0), 0)

  return (
    <section className="space-y-4">
      <div className={card}>
        <h3 className="text-base font-semibold text-neutral-100">Links de corretora — rotação diária</h3>
        <p className="mt-1 text-sm leading-relaxed text-neutral-400">
          Põe aqui o link de recomendação de cada IB. O sistema dá <b>um dia a cada um</b>, à vez, e
          todos os sítios que mandam abrir conta passam a usar{" "}
          <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-[12px]">morethanmoney.pt/abrir-conta</code>.
          O peso multiplica os dias: peso 2 apanha o dobro dos dias de peso 1.
        </p>
        {estado && (
          <p className="mt-3 text-sm text-neutral-300">
            Hoje é de <b className="text-[#D2A63C]">{estado.hoje.etiqueta}</b>
            <span className="ml-2 text-neutral-500">· {total} encaminhamentos no total</span>
          </p>
        )}
      </div>

      {erro && <p className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{erro}</p>}

      <div className={card}>
        <h4 className="mb-3 text-sm font-semibold text-neutral-200">Acrescentar link</h4>
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto_auto]">
          <input className={input} placeholder="De quem é (ex.: Ricardo)" value={novo.etiqueta}
            onChange={(e) => setNovo({ ...novo, etiqueta: e.target.value })} />
          <input className={input} placeholder="https://…" value={novo.url}
            onChange={(e) => setNovo({ ...novo, url: e.target.value })} />
          <input className={input} type="number" min={1} max={20} value={novo.peso}
            onChange={(e) => setNovo({ ...novo, peso: Number(e.target.value) })} />
          <button
            className={`${btn} bg-[#D2A63C] text-black`}
            disabled={ocupado || !novo.etiqueta.trim() || !/^https?:\/\//i.test(novo.url.trim())}
            onClick={async () => { await comando({ acao: "criar", ...novo }); setNovo({ etiqueta: "", url: "", peso: 1 }) }}
          >
            Adicionar
          </button>
        </div>
      </div>

      <div className={card}>
        <h4 className="mb-3 text-sm font-semibold text-neutral-200">Na rotação</h4>
        {!estado?.links.length ? (
          <p className="text-sm text-neutral-500">
            Sem links. Enquanto estiver vazio, <code>/abrir-conta</code> usa o link da casa.
          </p>
        ) : (
          <div className="space-y-2">
            {estado.links.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 p-3">
                <span className="min-w-[120px] text-sm font-semibold text-neutral-100">{l.etiqueta}</span>
                <a href={l.url} target="_blank" rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-[12.5px] text-neutral-400 hover:text-neutral-200">{l.url}</a>
                <span className="text-[12px] text-neutral-500">peso {l.peso}</span>
                <span className="text-[12px] text-neutral-500">{l.cliques} cliques</span>
                <button className={`${btn} ${l.ativo ? "bg-emerald-900/50 text-emerald-300" : "bg-neutral-800 text-neutral-400"}`}
                  disabled={ocupado}
                  onClick={() => comando({ acao: "editar", id: l.id, ativo: !l.ativo })}>
                  {l.ativo ? "Ativo" : "Parado"}
                </button>
                <button className={`${btn} bg-neutral-800 text-neutral-300`} disabled={ocupado}
                  onClick={() => comando({ acao: "editar", id: l.id, peso: Math.min(20, l.peso + 1) })}>+peso</button>
                <button className={`${btn} bg-red-950/60 text-red-300`} disabled={ocupado}
                  onClick={() => comando({ acao: "apagar", id: l.id })}>Apagar</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {estado?.proximos?.length ? (
        <div className={card}>
          <h4 className="mb-3 text-sm font-semibold text-neutral-200">Próximos sete dias</h4>
          <div className="flex flex-wrap gap-2">
            {estado.proximos.map((p, i) => (
              <span key={p.dia}
                className="rounded-lg border border-neutral-800 px-3 py-1.5 text-[12.5px] text-neutral-300">
                <span className="text-neutral-500">{p.dia.slice(5)}</span>{" "}
                <b className={i === 0 ? "text-[#D2A63C]" : ""}>{p.etiqueta}</b>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className={card}>
        <h4 className="mb-2 text-sm font-semibold text-neutral-200">Para o VPS de vendas</h4>
        <p className="text-[13px] leading-relaxed text-neutral-400">
          O link de hoje em JSON:{" "}
          <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-[12px]">GET /api/broker-link</code>.
          A pool inteira (para distribuir por conversa em vez de por dia):{" "}
          <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-[12px]">GET /api/broker-link?pool=1</code>{" "}
          com <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-[12px]">Authorization: Bearer CRON_SECRET</code>.
          O mesmo segredo escreve na pool por <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-[12px]">POST /api/admin/broker-links</code>.
        </p>
      </div>
    </section>
  )
}
