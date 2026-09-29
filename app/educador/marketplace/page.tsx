"use client"

/**
 * A ÁREA DO EDUCADOR — os meus produtos, e o meu extracto.
 *
 * Vive fora do `/live-sessions/studio` de propósito: o estúdio é a transmissão (OBS, chaves de
 * ingestão, dobragem), e isto é o negócio. Partilham a sessão — o mesmo cookie `mtm_educator_token`
 * — mas não partilham o ecrã, e assim uma sessão de aula não fica com um painel de vendas ao lado.
 *
 * A PARTILHA NÃO SE EDITA AQUI. É o acordo, e mostra-se em modo de leitura. Se ela fosse um campo
 * deste formulário, cada educador escrevia 95 no próprio contrato e o intervalo prometido deixava
 * de ser um intervalo.
 */

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { euros } from "@/lib/marketplace/regras"

type Produto = {
  id: string; slug: string; titulo: string; subtitulo: string | null; descricao: string | null
  tipo: string; preco_cents: number; moeda: string; conteudo_url: string | null; conteudo_nota: string | null
  estado: string; activo: boolean; stripe_price_id: string | null; motivo_recusa: string | null
  desempenho: { vendas: number; aReceberCents: number }
}
type Dados = {
  marketplaceLigado: boolean
  revisaoObrigatoria: boolean
  vendedor: { activo: boolean; partilha_pct: number; temConta: boolean } | null
  produtos: Produto[]
  extracto: { vendas: number; brutoCents: number; aReceberCents: number }
}

const VAZIO = { titulo: "", subtitulo: "", descricao: "", tipo: "curso", preco_cents: 0, conteudo_url: "", conteudo_nota: "" }

export default function EducadorMarketplacePage() {
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [form, setForm] = useState<typeof VAZIO & { id?: string }>(VAZIO)
  const [aGravar, setAGravar] = useState(false)

  const ler = useCallback(async () => {
    const r = await fetch("/api/live-sessions/educator-auth/marketplace")
    if (r.status === 401) { setErro("Entra com a tua conta de educador para veres os teus produtos."); return }
    setDados(await r.json())
  }, [])
  useEffect(() => { void ler() }, [ler])

  const gravar = useCallback(async (accao?: "publicar" | "retirar") => {
    setAGravar(true); setErro(null)
    try {
      const metodo = form.id ? "PATCH" : "POST"
      const r = await fetch("/api/live-sessions/educator-auth/marketplace", {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, accao }),
      })
      const j = await r.json()
      if (!r.ok) { setErro(j.error ?? "Não consegui gravar."); return }
      setForm(VAZIO)
      await ler()
    } finally { setAGravar(false) }
  }, [form, ler])

  if (erro && !dados) return <main className="mx-auto max-w-3xl p-8 text-sm text-zinc-400">{erro}</main>
  if (!dados) return <main className="flex justify-center p-16 text-zinc-500"><Loader2 className="animate-spin" /></main>

  const bloqueado = !dados.marketplaceLigado || !dados.vendedor?.activo

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-100">Os meus produtos</h1>
        <p className="mt-1 text-sm text-zinc-400">Cursos, mentorias e produtos teus. Nós tratamos do pagamento e da entrega.</p>
      </header>

      {bloqueado && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {!dados.marketplaceLigado
            ? "O marketplace ainda não está aberto. Podes preparar os teus produtos em rascunho."
            : "A tua conta de vendedor ainda não foi activada pela MTM. Fala connosco."}
        </p>
      )}

      {/* O extracto. Os números primeiro, porque é a isso que se volta. */}
      <section className="grid grid-cols-3 gap-3">
        {[
          ["Vendas", String(dados.extracto.vendas)],
          ["Vendido", euros(dados.extracto.brutoCents)],
          ["A receber", euros(dados.extracto.aReceberCents)],
        ].map(([r, v]) => (
          <div key={r} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">{r}</p>
            <p className="mt-1 text-xl font-semibold text-zinc-100">{v}</p>
          </div>
        ))}
      </section>
      {dados.vendedor && (
        <p className="text-xs text-zinc-500">
          Ficas com <span className="text-[#D2A63C]">{dados.vendedor.partilha_pct}%</span> de cada venda.
          {!dados.vendedor.temConta && " Falta registares a conta para onde queres receber — fala connosco."}
        </p>
      )}

      {/* Criar / editar */}
      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-[#D2A63C]">
          {form.id ? "Editar produto" : "Novo produto"}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className={CAMPO} placeholder="Título" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
          <select className={CAMPO} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
            {["curso", "mentoria", "ebook", "comunidade", "outro"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input className={CAMPO} placeholder="Subtítulo" value={form.subtitulo} onChange={(e) => setForm({ ...form, subtitulo: e.target.value })} />
          <input className={CAMPO} type="number" placeholder="Preço em cêntimos (9900 = 99 €)" value={form.preco_cents}
            onChange={(e) => setForm({ ...form, preco_cents: Number(e.target.value) })} />
          <textarea className={`${CAMPO} sm:col-span-2`} rows={3} placeholder="Descrição — é o que a pessoa lê antes de decidir (mín. 30 caracteres)"
            value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          <input className={`${CAMPO} sm:col-span-2`} placeholder="Link do conteúdo (para onde vai quem comprar)"
            value={form.conteudo_url} onChange={(e) => setForm({ ...form, conteudo_url: e.target.value })} />
          <input className={`${CAMPO} sm:col-span-2`} placeholder="Nota de acesso (opcional)"
            value={form.conteudo_nota} onChange={(e) => setForm({ ...form, conteudo_nota: e.target.value })} />
        </div>
        {erro && <p className="mt-3 text-sm text-amber-300">{erro}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={aGravar} onClick={() => gravar()} className={BOTAO}>
            {form.id ? "Guardar" : "Criar rascunho"}
          </button>
          {form.id && (
            <button type="button" disabled={aGravar || bloqueado} onClick={() => gravar("publicar")} className={BOTAO_OURO}>
              {dados.revisaoObrigatoria ? "Enviar para revisão" : "Publicar"}
            </button>
          )}
          {form.id && <button type="button" onClick={() => setForm(VAZIO)} className={BOTAO}>Cancelar</button>}
        </div>
      </section>

      {/* A lista */}
      <section className="space-y-2">
        {dados.produtos.length === 0 && <p className="text-sm text-zinc-500">Ainda não criaste nenhum produto.</p>}
        {dados.produtos.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="min-w-0">
              <p className="font-medium text-zinc-100">{p.titulo}</p>
              <p className="text-xs text-zinc-500">
                {p.estado} · {euros(p.preco_cents, p.moeda)} · {p.desempenho.vendas} venda(s) · {euros(p.desempenho.aReceberCents)} para ti
              </p>
              {p.motivo_recusa && <p className="mt-1 text-xs text-amber-300">Recusado: {p.motivo_recusa}</p>}
            </div>
            <div className="flex gap-2">
              <button type="button" className={BOTAO}
                onClick={() => setForm({
                  id: p.id, titulo: p.titulo, subtitulo: p.subtitulo ?? "", descricao: p.descricao ?? "",
                  tipo: p.tipo, preco_cents: p.preco_cents, conteudo_url: p.conteudo_url ?? "", conteudo_nota: p.conteudo_nota ?? "",
                })}>
                Editar
              </button>
            </div>
          </div>
        ))}
      </section>
    </main>
  )
}

const CAMPO = "rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
const BOTAO = "rounded-lg border border-white/15 px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/5 disabled:opacity-50"
const BOTAO_OURO = "rounded-lg bg-[#D2A63C] px-3 py-1.5 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
