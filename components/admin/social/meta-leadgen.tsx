"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Check, Copy, ExternalLink, Loader2, Plug, RefreshCw, ShieldCheck, Wand2, X } from "lucide-react"
import { hrefBackoffice } from "./navegacao"

type Estado = {
  callback: string
  campo: string
  objeto: string
  verifyToken: string
  verifyTokenOrigem: "painel" | "ambiente" | "omissao"
  segredoDaApp: boolean
  paginas: Array<{ id: string; nome: string; leadgen: boolean; campos: string[]; erro?: string }>
  leads: { total: number; ultimos: Array<{ id: string; nome: string | null; marca: string; quando: string; tarefa: string | null }> }
}

const ORIGEM: Record<Estado["verifyTokenOrigem"], string> = {
  painel: "guardado aqui",
  ambiente: "variável de ambiente",
  omissao: "valor de omissão — troca por um teu",
}

/**
 * O webhook dos formulários instantâneos da Meta (`/api/webhooks/meta-leadgen`), à vista.
 * Diz o que colar na app da Meta, prova que o callback responde e liga as Páginas ao campo `leadgen`
 * sem tirar os campos que já lá estão (mensagens). Cada lead cai em `pedidos_contacto` → CRM.
 */
export function MetaLeadgen() {
  const [e, setE] = useState<Estado | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aFazer, setAFazer] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [novo, setNovo] = useState("")
  const [copiado, setCopiado] = useState<string | null>(null)

  const ler = useCallback(async () => {
    setErro(null)
    const r = await fetch("/api/admin/social/meta-leadgen", { cache: "no-store" })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) setErro(j.message || j.error || "Não consegui ler o estado do webhook.")
    else setE(j)
  }, [])

  useEffect(() => {
    ler()
  }, [ler])

  const acao = async (corpo: Record<string, unknown>, rotulo: string) => {
    setAFazer(rotulo)
    setAviso(null)
    try {
      const r = await fetch("/api/admin/social/meta-leadgen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setAviso({ ok: false, texto: j.error || "A acção falhou." })
      else {
        if (j.callback) setE(j)
        if (j.paginas && !j.callback && e) setE({ ...e, paginas: j.paginas })
        setAviso({
          ok: j.ok !== false,
          texto:
            j.mensagem ||
            (corpo.acao === "ligar_paginas"
              ? j.ok
                ? "Páginas ligadas ao campo leadgen."
                : "Alguma Página ficou por ligar — vê o motivo na linha dela."
              : "Guardado."),
        })
        if (corpo.acao === "guardar_token") setNovo("")
      }
    } finally {
      setAFazer(null)
    }
  }

  const copiar = async (texto: string, chave: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(chave)
      setTimeout(() => setCopiado(null), 1500)
    } catch {
      /* sem clipboard: o texto está à vista para copiar à mão */
    }
  }

  if (erro) return <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{erro}</p>
  if (!e)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-[#D2A63C]" />
      </div>
    )

  const ligadas = e.paginas.filter((p) => p.leadgen).length
  const passos: Array<{ feito: boolean; titulo: string; nota: string }> = [
    { feito: e.segredoDaApp, titulo: "Segredo da app guardado", nota: "Confirma a assinatura de cada entrega (Ligações → Instagram)." },
    { feito: e.verifyTokenOrigem !== "omissao", titulo: "Verify token teu", nota: "O mesmo valor vai na app da Meta." },
    { feito: e.paginas.length > 0, titulo: "Token de Página com leads_retrieval", nota: "Sem ele o lead chega mas não se consegue ler." },
    { feito: e.paginas.length > 0 && ligadas === e.paginas.length, titulo: "Páginas subscritas a leadgen", nota: "Uma vez por Página; o botão abaixo faz isto." },
  ]

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#D2A63C]/80">Ligações · Meta</p>
          <h2 className="text-lg font-semibold text-zinc-100">Leads dos formulários instantâneos</h2>
          <p className="mt-1 max-w-xl text-sm text-zinc-400">
            Cada lead de um anúncio com formulário entra aqui, fica com o consentimento que a pessoa marcou e vira
            tarefa de contacto no CRM.
          </p>
        </div>
        <button
          type="button"
          onClick={ler}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-[#D2A63C]/40 hover:text-[#E9C46A]"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </button>
      </header>

      <ol className="grid gap-2 sm:grid-cols-2">
        {passos.map((p) => (
          <li key={p.titulo} className="flex gap-3 rounded-xl border border-white/[0.07] bg-zinc-900/50 p-3">
            <span
              className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-md ${
                p.feito ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
              }`}
            >
              {p.feito ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            </span>
            <span>
              <span className="block text-sm font-medium text-zinc-100">{p.titulo}</span>
              <span className="block text-xs text-zinc-500">{p.nota}</span>
            </span>
          </li>
        ))}
      </ol>

      <section className="rounded-2xl border border-white/[0.07] bg-zinc-900/50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-zinc-100">O que colar na app da Meta</h3>
        <p className="mb-3 text-xs text-zinc-500">
          developers.facebook.com → app «Agente de Conteudo» → Webhooks → objecto <b className="text-zinc-300">Page</b> → campo{" "}
          <b className="text-zinc-300">leadgen</b>.
        </p>
        <dl className="space-y-2">
          {[
            { k: "callback", rotulo: "URL de callback", valor: e.callback },
            { k: "token", rotulo: "Verify token", valor: e.verifyToken, nota: ORIGEM[e.verifyTokenOrigem] },
          ].map((l) => (
            <div key={l.k} className="flex flex-wrap items-center gap-2 rounded-lg bg-black/30 px-3 py-2">
              <dt className="w-28 flex-none text-xs text-zinc-500">{l.rotulo}</dt>
              <dd className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-[#E9C46A]">{l.valor}</dd>
              {l.nota && <span className="text-[11px] text-zinc-500">{l.nota}</span>}
              <button
                type="button"
                onClick={() => copiar(l.valor, l.k)}
                className="rounded-md p-1.5 text-zinc-400 transition hover:bg-white/5 hover:text-[#E9C46A]"
                aria-label={`Copiar ${l.rotulo}`}
              >
                {copiado === l.k ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          ))}
        </dl>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={novo}
            onChange={(ev) => setNovo(ev.target.value)}
            placeholder="Cola aqui o teu verify token"
            className="min-w-[220px] flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#D2A63C]/50 focus:outline-none"
          />
          <button
            type="button"
            disabled={!novo.trim() || Boolean(aFazer)}
            onClick={() => acao({ acao: "guardar_token", token: novo }, "guardar")}
            className="rounded-lg bg-[#D2A63C] px-3 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-[#E9C46A] disabled:opacity-40"
          >
            Guardar
          </button>
          <button
            type="button"
            disabled={Boolean(aFazer)}
            onClick={() => acao({ acao: "gerar_token" }, "gerar")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 transition hover:border-[#D2A63C]/40 hover:text-[#E9C46A] disabled:opacity-40"
          >
            <Wand2 className="h-4 w-4" /> Gerar um
          </button>
          <button
            type="button"
            disabled={Boolean(aFazer)}
            onClick={() => acao({ acao: "testar" }, "testar")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 transition hover:border-[#D2A63C]/40 hover:text-[#E9C46A] disabled:opacity-40"
          >
            {aFazer === "testar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Testar verificação
          </button>
        </div>
        {aviso && (
          <p className={`mt-3 rounded-lg px-3 py-2 text-xs ${aviso.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>
            {aviso.texto}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-white/[0.07] bg-zinc-900/50 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-100">
            Páginas <span className="text-zinc-500">· {ligadas}/{e.paginas.length} com leadgen</span>
          </h3>
          <button
            type="button"
            disabled={Boolean(aFazer) || !e.paginas.length}
            onClick={() => acao({ acao: "ligar_paginas" }, "ligar")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D2A63C]/40 bg-[#D2A63C]/10 px-3 py-1.5 text-xs font-medium text-[#E9C46A] transition hover:bg-[#D2A63C]/20 disabled:opacity-40"
          >
            {aFazer === "ligar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />} Ligar Páginas a leadgen
          </button>
        </div>
        {e.paginas.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum token de Página guardado alcança uma Página. Cola-o em Ligações → Instagram.</p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {e.paginas.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className={`h-2 w-2 rounded-full ${p.leadgen ? "bg-emerald-400" : "bg-amber-400"}`} />
                <span className="font-medium text-zinc-100">{p.nome}</span>
                <span className="text-xs text-zinc-500">{p.campos.length ? p.campos.join(" · ") : "sem campos subscritos"}</span>
                {p.erro && <span className="w-full text-xs text-red-300">{p.erro}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-white/[0.07] bg-zinc-900/50 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-100">
            Últimos leads <span className="text-zinc-500">· {e.leads.total} no total</span>
          </h3>
          <Link
            href={hrefBackoffice("conversao")}
            className="inline-flex items-center gap-1 text-xs text-[#E9C46A] hover:underline"
          >
            Trabalhar no CRM <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        {e.leads.ultimos.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Ainda não entrou nenhum. Testa no Meta Lead Ads Testing Tool: escolhe a Página e o formulário → «Criar lead».
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {e.leads.ultimos.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="font-medium text-zinc-100">{l.nome || "Sem nome"}</span>
                <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-zinc-300">{l.marca}</span>
                <span className="text-xs text-zinc-500">
                  {new Date(l.quando).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
                {l.tarefa && <span className="ml-auto text-xs text-zinc-400">tarefa: {l.tarefa}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
