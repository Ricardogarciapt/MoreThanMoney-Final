"use client"

/**
 * OS CÓDIGOS DE DESCONTO DO EDUCADOR.
 *
 * ── PORQUE É QUE O ÂMBITO NÃO É UMA PERGUNTA ABERTA ───────────────────────────────────────
 *
 * Só há duas escolhas: «em tudo o que é meu» ou «só neste produto». Não há uma terceira, e não é
 * por o ecrã ser simples — é porque a terceira (um código que valha na loja inteira) desconta o
 * produto de outra pessoa, e o desconto sai da VENDA, ou seja, do bolso dela. O servidor impõe o
 * mesmo, e a base de dados também (`check coupons_educador_tem_ambito`): três guardas, porque uma
 * que vive só no ecrã é uma que o próximo botão esquece.
 *
 * ── O QUE SE DIZ, E QUE NÃO É ÓBVIO ───────────────────────────────────────────────────────
 *
 * Que o desconto sai da parte dele. Um educador que dá 30% a pensar que a casa cobre a diferença
 * descobre-o no extracto, e aí é tarde. Está escrito no ecrã, antes de ele criar o código.
 */

import { useCallback, useEffect, useState } from "react"
import { Loader2, Plus, Ticket, X } from "lucide-react"

type Cupao = {
  id: string
  code: string
  discount_value: number
  is_active: boolean
  valid_until: string | null
  max_uses: number | null
  marketplace_produto_id: string | null
  usos: number
}

const ROTA = "/api/marketplace/cupoes"

export default function CupoesEducador({
  produtos,
  partilhaPct,
}: {
  produtos: { id: string; titulo: string }[]
  partilhaPct: number | null
}) {
  const [cupoes, setCupoes] = useState<Cupao[] | null>(null)
  const [maxPct, setMaxPct] = useState(90)
  const [aAbrir, setAAbrir] = useState(false)
  const [aGravar, setAGravar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [form, setForm] = useState({ code: "", pct: "10", ambito: "todos", produto: "", max_uses: "", valid_until: "" })

  const ler = useCallback(async () => {
    try {
      const r = await fetch(ROTA)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? "Não consegui ler os códigos.")
      setCupoes(j.cupoes ?? [])
      if (j.maxPct) setMaxPct(j.maxPct)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      setCupoes([])
    }
  }, [])

  useEffect(() => { void ler() }, [ler])

  const criar = useCallback(async () => {
    setErro(null)
    if (form.ambito === "produto" && !form.produto) {
      // Um âmbito escolhido e deixado em branco parece restrito e vale em tudo. O ecrã apanha a
      // distracção; o servidor não consegue distingui-la da intenção.
      setErro("Escolhe o produto a que o código se aplica.")
      return
    }
    setAGravar(true)
    try {
      const r = await fetch(ROTA, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          discount_value: Number(form.pct),
          marketplace_produto_id: form.ambito === "produto" ? form.produto : null,
          max_uses: form.max_uses ? Number(form.max_uses) : null,
          valid_until: form.valid_until || null,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? "Não consegui criar o código.")
      setAAbrir(false)
      setForm({ code: "", pct: "10", ambito: "todos", produto: "", max_uses: "", valid_until: "" })
      await ler()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setAGravar(false)
    }
  }, [form, ler])

  const alternar = useCallback(async (c: Cupao) => {
    await fetch(ROTA, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, is_active: !c.is_active }),
    })
    await ler()
  }, [ler])

  const tituloDe = (id: string | null) =>
    id ? produtos.find((p) => p.id === id)?.titulo ?? "um produto" : "todos os meus produtos"

  return (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-black/30 p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-200">
          <Ticket size={15} className="text-[#D2A63C]" /> Códigos de desconto
          {cupoes && <span className="text-zinc-500">({cupoes.length})</span>}
        </h3>
        <button
          onClick={() => { setAAbrir((v) => !v); setErro(null) }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#D2A63C]/35 bg-[#D2A63C]/12 px-3 py-1.5 text-sm text-[#D2A63C] hover:bg-[#D2A63C]/20"
        >
          {aAbrir ? <X size={14} /> : <Plus size={14} />} {aAbrir ? "Fechar" : "Novo código"}
        </button>
      </div>

      {/* Dito ANTES de criar, e não descoberto no extracto. */}
      <p className="text-xs leading-relaxed text-zinc-500">
        O desconto sai da venda: se deres 20% num produto de 100 €, o cliente paga 80 € e a tua parte
        {partilhaPct ? ` (${partilhaPct}%)` : ""} é calculada sobre os 80 €, não sobre os 100 €. A casa não
        cobre a diferença. Campanha e código não se somam — vale o maior dos dois.
      </p>

      {erro && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{erro}</p>}

      {aAbrir && (
        <div className="space-y-3 rounded-lg border border-zinc-800 bg-black/40 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-zinc-500">Código</span>
              <input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="LANCAMENTO20"
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-3 py-2 text-sm uppercase text-zinc-100"
              />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-zinc-500">Desconto (máx. {maxPct}%)</span>
              <input
                type="number"
                min={1}
                max={maxPct}
                value={form.pct}
                onChange={(e) => setForm((f) => ({ ...f, pct: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-[11px] uppercase tracking-wide text-zinc-500">Onde é que vale</span>
            <select
              value={form.ambito}
              onChange={(e) => setForm((f) => ({ ...f, ambito: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="todos">Em todos os meus produtos</option>
              <option value="produto">Só num produto</option>
            </select>
          </label>

          {form.ambito === "produto" && (
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-zinc-500">Produto</span>
              <select
                value={form.produto}
                onChange={(e) => setForm((f) => ({ ...f, produto: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="">Escolhe</option>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>{p.titulo}</option>
                ))}
              </select>
            </label>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-zinc-500">Quantas vezes (vazio = sem limite)</span>
              <input
                type="number"
                min={1}
                value={form.max_uses}
                onChange={(e) => setForm((f) => ({ ...f, max_uses: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-zinc-500">Até quando (vazio = sem prazo)</span>
              <input
                type="date"
                value={form.valid_until}
                onChange={(e) => setForm((f) => ({ ...f, valid_until: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-black/50 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
          </div>

          <p className="text-[11px] text-zinc-500">Cada pessoa só pode usar cada código uma vez.</p>

          <button
            onClick={() => void criar()}
            disabled={aGravar}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#D2A63C] px-4 py-2 text-sm font-semibold text-black hover:bg-[#BB8525] disabled:opacity-60"
          >
            {aGravar ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Criar código
          </button>
        </div>
      )}

      {cupoes === null ? (
        <p className="flex items-center gap-2 py-3 text-xs text-zinc-500"><Loader2 size={13} className="animate-spin" /> A ler…</p>
      ) : cupoes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-500">
          Ainda não tens códigos. Um código de lançamento é a maneira mais rápida de a primeira venda acontecer.
        </p>
      ) : (
        <div className="space-y-1.5">
          {cupoes.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-black/40 px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-zinc-100">{c.code}</span>
                  <span className="rounded bg-[#D2A63C]/15 px-1.5 py-0.5 text-[11px] font-medium text-[#D2A63C]">
                    −{c.discount_value}%
                  </span>
                  {!c.is_active && <span className="text-[11px] text-zinc-500">desligado</span>}
                </div>
                <div className="text-[11px] text-zinc-500">
                  Em {tituloDe(c.marketplace_produto_id)} · usado {c.usos}
                  {c.max_uses ? ` de ${c.max_uses}` : " vezes"}
                  {c.valid_until ? ` · até ${new Date(c.valid_until).toLocaleDateString("pt-PT")}` : ""}
                </div>
              </div>
              <button
                onClick={() => void alternar(c)}
                className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-500"
              >
                {c.is_active ? "Desligar" : "Ligar"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
