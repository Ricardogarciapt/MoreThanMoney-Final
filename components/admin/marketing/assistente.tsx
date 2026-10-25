'use client'

import { useState } from 'react'
import { Bot, Loader2, Send, Wrench } from 'lucide-react'
import MarkdownRenderer from '@/components/dashboard-gestao/markdown-renderer'
import { Aviso, Chip, pedirCentro, useCentro } from '@/components/admin/centro/ui'
import { Alertas } from './comum'

type Especialista = { id: string; nome: string; papel: string }
type Resposta = {
  especialista: string
  nomeEspecialista: string
  motivo: string
  resposta: string
  ferramentas: { nome: string; ok: boolean; resumo: string }[]
  correcoes: string[]
  alertas: string[]
  rascunhos: string[]
}
type Mensagem = { role: 'user' | 'assistant'; content: string; extra?: Resposta }

const SUGESTOES = [
  'Lança um produto novo: workshop de gestão de risco a 29 €. Quero o kit completo.',
  'Como estão as campanhas Meta desta semana e onde mexo no orçamento?',
  'Onde está a maior queda no funil dos últimos 30 dias?',
  'Plano de conteúdo de 2 semanas para a palavra LIBERDADE.',
  'Sequência de 5 emails para quem preencheu o formulário e não marcou chamada.',
]

/**
 * ASSISTENTE DE MARKETING — a equipa de especialistas (padrão telegram-bot-crewai): o router escolhe
 * quem responde, o especialista usa as ferramentas reais do negócio e o revisor passa a resposta
 * pelas regras. O mesmo cérebro responde ao /marketing no Telegram.
 */
export default function MarketingAssistente() {
  const { dados } = useCentro<{ especialistas: Especialista[] }>('/api/admin/marketing/assistente', 600_000)
  const [forcar, setForcar] = useState<string>('')
  const [texto, setTexto] = useState('')
  const [conversa, setConversa] = useState<Mensagem[]>([])
  const [aPensar, setAPensar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const enviar = async (pedido: string) => {
    if (!pedido.trim() || aPensar) return
    setErro(null); setAPensar(true); setTexto('')
    const historico = conversa.map(({ role, content }) => ({ role, content }))
    setConversa((c) => [...c, { role: 'user', content: pedido }])
    const r = await pedirCentro<Resposta>('/api/admin/marketing/assistente', { method: 'POST', body: { pedido, historico, especialista: forcar || undefined } })
    setAPensar(false)
    if (r.success && r.data) setConversa((c) => [...c, { role: 'assistant', content: r.data!.resposta, extra: r.data! }])
    else setErro(r.error ?? 'Sem resposta.')
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip activo={!forcar} onClick={() => setForcar('')}>Automático</Chip>
        {dados?.especialistas.map((e) => (
          <span key={e.id} title={e.papel}><Chip activo={forcar === e.id} onClick={() => setForcar(e.id)}>{e.nome}</Chip></span>
        ))}
      </div>

      <div className="min-h-[40vh] space-y-3 rounded-xl border border-white/[0.06] bg-zinc-950/60 p-4">
        {!conversa.length && (
          <div className="space-y-2">
            <p className="text-xs text-zinc-400">Pede como pedirias a uma agência. O que for para criar (kit de lançamento, campanha Meta) fica em <b className="text-[#E9C46A]">Rascunhos</b> à tua espera.</p>
            <div className="flex flex-wrap gap-1.5">
              {SUGESTOES.map((s) => (
                <button key={s} type="button" onClick={() => void enviar(s)} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-left text-[11px] text-zinc-300 hover:border-[#D2A63C]/40 hover:text-[#E9C46A]">{s}</button>
              ))}
            </div>
          </div>
        )}
        {conversa.map((m, i) => (
          m.role === 'user' ? (
            <div key={i} className="ml-auto max-w-[85%] rounded-lg bg-[#D2A63C]/10 px-3 py-2 text-xs text-zinc-100">{m.content}</div>
          ) : (
            <div key={i} className="space-y-2 rounded-lg border border-white/[0.06] bg-black/30 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#E9C46A]">
                <Bot className="h-3.5 w-3.5" /> {m.extra?.nomeEspecialista}
                <span className="font-normal text-zinc-500">· {m.extra?.motivo}</span>
              </p>
              {!!m.extra?.ferramentas.length && (
                <div className="flex flex-wrap gap-1">
                  {m.extra.ferramentas.map((f, j) => (
                    <span key={j} title={f.resumo} className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${f.ok ? 'border-emerald-500/30 text-emerald-300' : 'border-rose-500/30 text-rose-300'}`}>
                      <Wrench className="h-2.5 w-2.5" /> {f.nome}
                    </span>
                  ))}
                </div>
              )}
              <div className="text-sm"><MarkdownRenderer content={m.content} /></div>
              <Alertas alertas={m.extra?.alertas} />
              {!!m.extra?.correcoes.length && <p className="text-[10.5px] text-zinc-500">Revisor corrigiu: {m.extra.correcoes.join(' · ')}</p>}
              {!!m.extra?.rascunhos.length && (
                <a href="?v=rascunhos" className="inline-block text-[11px] text-[#E9C46A] underline">{m.extra.rascunhos.length} rascunho(s) para aplicar →</a>
              )}
            </div>
          )
        ))}
        {aPensar && <p className="flex items-center gap-2 text-xs text-zinc-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> A equipa está a trabalhar (pode levar até um minuto)…</p>}
        {erro && <Aviso tom="grave">{erro}</Aviso>}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); void enviar(texto) }} className="flex gap-2">
        <textarea
          rows={2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(texto) } }}
          placeholder="Ex.: lança um produto novo, revê as campanhas, desenha um funil…"
          className="flex-1 resize-none rounded-lg border border-zinc-800 bg-black/40 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-[#D2A63C]/50 focus:outline-none"
        />
        <button type="submit" disabled={!texto.trim() || aPensar} className="inline-flex items-center gap-1.5 self-end rounded-lg bg-[#D2A63C] px-4 py-2 text-xs font-semibold text-black disabled:opacity-50">
          <Send className="h-3.5 w-3.5" /> Enviar
        </button>
      </form>
    </div>
  )
}
