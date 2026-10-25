'use client'

import { useEffect, useState } from 'react'
import { Loader2, Plus, Save, Trash2 } from 'lucide-react'
import type { Marca } from '@/lib/marketing/marca'
import { Aviso, Botao, Painel, pedirCentro, useCentro } from '@/components/admin/centro/ui'
import { entrada } from './comum'

const CAMPOS: { k: Exclude<keyof Marca, 'produtos'>; rotulo: string; area?: boolean }[] = [
  { k: 'nome', rotulo: 'Nome da marca' },
  { k: 'site', rotulo: 'Site' },
  { k: 'publico', rotulo: 'Público', area: true },
  { k: 'dores', rotulo: 'Dores do público', area: true },
  { k: 'promessa', rotulo: 'Promessa (sem resultados garantidos)', area: true },
  { k: 'tom', rotulo: 'Tom de voz', area: true },
  { k: 'provas', rotulo: 'Provas com origem (pips, fonte, período)', area: true },
  { k: 'concorrentes', rotulo: 'Concorrentes', area: true },
  { k: 'evitar', rotulo: 'O que nunca dizer', area: true },
]

/** MARCA — o cérebro que o Estúdio e os especialistas leem em cada pedido. Só o dono grava. */
export default function MarketingMarca() {
  const { dados, erro } = useCentro<{ marca: Marca; base: Marca }>('/api/admin/marketing/marca', 600_000)
  const [m, setM] = useState<Marca | null>(null)
  const [aGravar, setAGravar] = useState(false)
  const [msg, setMsg] = useState<{ tom: 'info' | 'grave'; t: string } | null>(null)
  useEffect(() => { if (dados && !m) setM(dados.marca) }, [dados, m])

  if (erro) return <Aviso tom="grave">{erro}</Aviso>
  if (!m) return <Loader2 className="h-5 w-5 animate-spin text-[#D2A63C]" />

  const gravar = async () => {
    setAGravar(true); setMsg(null)
    const r = await pedirCentro('/api/admin/marketing/marca', { method: 'PUT', body: { marca: m } })
    setAGravar(false)
    setMsg(r.success ? { tom: 'info', t: 'Marca gravada. Os próximos pedidos já a usam.' } : { tom: 'grave', t: r.error ?? 'Não gravou.' })
  }
  const produto = (i: number, k: keyof Marca['produtos'][number], v: string) =>
    setM({ ...m, produtos: m.produtos.map((p, j) => (j === i ? { ...p, [k]: v } : p)) })

  return (
    <div className="space-y-3">
      <Painel titulo="A marca da casa" sub="Entra em todos os geradores do Estúdio e em todos os especialistas do Assistente.">
        <div className="grid gap-2 md:grid-cols-2">
          {CAMPOS.map((c) => (
            <label key={c.k} className={`block space-y-1 ${c.area ? 'md:col-span-2' : ''}`}>
              <span className="text-[10px] uppercase tracking-wider text-zinc-500">{c.rotulo}</span>
              {c.area
                ? <textarea rows={3} value={m[c.k]} onChange={(e) => setM({ ...m, [c.k]: e.target.value })} className={entrada} />
                : <input value={m[c.k]} onChange={(e) => setM({ ...m, [c.k]: e.target.value })} className={entrada} />}
            </label>
          ))}
        </div>
      </Painel>
      <Painel titulo="Produtos e preços" accao={<Botao onClick={() => setM({ ...m, produtos: [...m.produtos, { nome: '', descricao: '', preco: '', link: '' }] })}><Plus className="h-3 w-3" /> Produto</Botao>}>
        <div className="space-y-2">
          {m.produtos.map((p, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-white/[0.06] p-2 md:grid-cols-[1fr_2fr_120px_1fr_auto]">
              <input value={p.nome} placeholder="Nome" onChange={(e) => produto(i, 'nome', e.target.value)} className={entrada} />
              <input value={p.descricao} placeholder="Descrição" onChange={(e) => produto(i, 'descricao', e.target.value)} className={entrada} />
              <input value={p.preco} placeholder="Preço" onChange={(e) => produto(i, 'preco', e.target.value)} className={entrada} />
              <input value={p.link} placeholder="Link" onChange={(e) => produto(i, 'link', e.target.value)} className={entrada} />
              <Botao tom="perigo" onClick={() => setM({ ...m, produtos: m.produtos.filter((_, j) => j !== i) })}><Trash2 className="h-3 w-3" /></Botao>
            </div>
          ))}
        </div>
      </Painel>
      <div className="flex items-center gap-2">
        <Botao tom="ouro" onClick={() => void gravar()} disabled={aGravar}>{aGravar ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Gravar marca</Botao>
        <Botao onClick={() => dados && setM(dados.base)}>Repor a base</Botao>
      </div>
      {msg && <Aviso tom={msg.tom}>{msg.t}</Aviso>}
    </div>
  )
}
