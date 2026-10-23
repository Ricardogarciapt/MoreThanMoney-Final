'use client'

import { useState } from 'react'
import { Check, Copy, Loader2, Sparkles } from 'lucide-react'

type Variacao = { angulo: string; gancho: string; texto: string; titulo: string; descricao: string; cta: string; palavraChave: string | null }

/**
 * ESTÚDIO DE ANÚNCIOS — três variações de anúncio Meta escritas com as regras da casa (ver a rota
 * `/api/admin/trafego/criativos`). Copia-se campo a campo para o Gestor de Anúncios.
 */
export default function EstudioAnuncios() {
  const [produto, setProduto] = useState('')
  const [publico, setPublico] = useState('')
  const [objectivo, setObjectivo] = useState('leads')
  const [angulo, setAngulo] = useState('')
  const [aGerar, setAGerar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [variacoes, setVariacoes] = useState<Variacao[]>([])
  const [copiado, setCopiado] = useState<string | null>(null)

  const gerar = async () => {
    setAGerar(true)
    setErro(null)
    const r = await fetch('/api/admin/trafego/criativos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ produto, publico, objectivo, angulo }) })
    const d = await r.json().catch(() => ({}))
    setAGerar(false)
    if (!r.ok) setErro(d.error ?? 'Não consegui gerar.')
    else setVariacoes(d.variacoes ?? [])
  }
  const copiar = async (k: string, t: string) => {
    try { await navigator.clipboard.writeText(t); setCopiado(k); setTimeout(() => setCopiado(null), 1500) } catch { /* sem permissão de cópia */ }
  }
  const Campo = ({ k, rotulo, t }: { k: string; rotulo: string; t: string }) => (
    <div className="group">
      <div className="flex items-center justify-between">
        <p className="text-[9.5px] uppercase tracking-widest text-zinc-500">{rotulo}</p>
        <button type="button" onClick={() => void copiar(k, t)} className="text-zinc-600 hover:text-[#E9C46A]" title="Copiar">
          {copiado === k ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
      <p className="whitespace-pre-wrap text-xs text-zinc-200">{t}</p>
    </div>
  )

  return (
    <div className="rounded-xl border border-[#D2A63C]/20 bg-[#D2A63C]/[0.02] p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-[#E9C46A]"><Sparkles className="h-4 w-4" /> Estúdio de anúncios</p>
      <p className="mt-0.5 text-[11px] text-zinc-400">Três variações (gancho, texto, título, CTA com palavra-chave do funil), sem números inventados nem promessas, com o aviso educativo.</p>
      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <input value={produto} onChange={(e) => setProduto(e.target.value)} placeholder="O que anuncias? (ex.: Bootcamp de trading)" className="rounded-md border border-zinc-800 bg-black/40 px-2.5 py-1.5 text-xs text-zinc-100 md:col-span-2" />
        <input value={publico} onChange={(e) => setPublico(e.target.value)} placeholder="Público (opcional)" className="rounded-md border border-zinc-800 bg-black/40 px-2.5 py-1.5 text-xs text-zinc-100" />
        <select value={objectivo} onChange={(e) => setObjectivo(e.target.value)} className="rounded-md border border-zinc-800 bg-black/40 px-2.5 py-1.5 text-xs text-zinc-100">
          <option value="leads">Leads</option>
          <option value="mensagens">Mensagens / comentários</option>
          <option value="marcacoes">Marcações de chamada</option>
          <option value="vendas">Vendas</option>
        </select>
        <input value={angulo} onChange={(e) => setAngulo(e.target.value)} placeholder="Ângulo (opcional: tempo, liberdade, método…)" className="rounded-md border border-zinc-800 bg-black/40 px-2.5 py-1.5 text-xs text-zinc-100 md:col-span-3" />
        <button type="button" disabled={!produto.trim() || aGerar} onClick={() => void gerar()} className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#D2A63C] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50">
          {aGerar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Gerar
        </button>
      </div>
      {erro && <p className="mt-2 text-xs text-rose-300">{erro}</p>}
      {variacoes.length > 0 && (
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {variacoes.map((v, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-zinc-800 bg-black/40 p-3">
              <p className="text-[11px] font-semibold text-[#E9C46A]">{v.angulo || `Variação ${i + 1}`}{v.palavraChave ? ` · comentar ${v.palavraChave}` : ''}</p>
              <Campo k={`${i}g`} rotulo="Gancho" t={v.gancho} />
              <Campo k={`${i}t`} rotulo="Texto principal" t={v.texto} />
              <Campo k={`${i}h`} rotulo="Título" t={v.titulo} />
              <Campo k={`${i}d`} rotulo="Descrição" t={v.descricao} />
              <Campo k={`${i}c`} rotulo="CTA" t={v.cta} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
