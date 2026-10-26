'use client'

import { useState } from 'react'

/**
 * OS CANAIS de um negócio, no cartão dele: WhatsApp, agenda, formulários, Instagram e Telegram.
 *
 * É a ficha do contacto — o que a pessoa disse e fez em cada canal — sem sair do pipeline. Lê-se só
 * quando se abre, como o histórico (`historico.tsx`): o pipeline abre-se todas as manhãs e cinquenta
 * leituras por visita para mostrar o que se abre num negócio ou dois era pagar à toa.
 *
 * Os dados vêm de `/api/backoffice/negocios/[id]/canais`, com a mesma fechadura do histórico.
 */
type Linha = Record<string, unknown>
type Canais = { whatsapp: Linha[]; agenda: Linha[]; formularios: Linha[]; instagram: Linha[]; telegram: Linha[] }

function quando(v: unknown): string {
  if (typeof v !== 'string') return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
const t = (v: unknown) => (v == null || v === '' ? '—' : String(v))

/** Uma linha por registo, já em português: o que aconteceu e quando. */
const DESCREVER: Record<keyof Canais, { nome: string; linha: (l: Linha) => string; href?: string }> = {
  whatsapp: {
    nome: 'WhatsApp',
    linha: (l) => `${t(l.estado)}${Number(l.por_responder) > 0 ? ` · ${l.por_responder} por responder` : ''} · última mensagem ${quando(l.ultima_entrada ?? l.ultima_saida)}`,
    href: '/backoffice/gestao/whatsapp',
  },
  agenda: { nome: 'Agenda', linha: (l) => `${quando(l.inicio)} · ${t(l.estado)}`, href: '/backoffice/gestao/agenda' },
  formularios: { nome: 'Formulários', linha: (l) => `${t(l.form_title ?? l.form_slug)} · ${quando(l.created_at)}`, href: '/backoffice/gestao/formularios' },
  instagram: { nome: 'Instagram', linha: (l) => `comentou ${t(l.keyword)}${l.intent ? ` (${l.intent})` : ''} · DM ${t(l.dm_status)} · ${quando(l.created_at)}`, href: '/backoffice/gestao/leads' },
  telegram: { nome: 'Telegram', linha: (l) => `${t(l.stage)}${l.interesse ? ` · ${l.interesse}` : ''} · ${t(l.message_count)} mensagens · ${quando(l.updated_at)}` },
}

export function CanaisDoNegocio({ id, ehDono }: { id: string; ehDono: boolean }) {
  const [aberto, setAberto] = useState(false)
  const [canais, setCanais] = useState<Canais | null>(null)
  const [aLer, setALer] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function abrir() {
    setAberto(true)
    if (canais !== null || aLer) return
    setALer(true)
    setErro(null)
    try {
      const r = await fetch(`/api/backoffice/negocios/${id}/canais`)
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        setErro(d?.detalhe || d?.error || 'Não consegui ler os canais.')
        return
      }
      setCanais(d as Canais)
    } catch {
      setErro('Sem ligação. Tenta outra vez.')
    } finally {
      setALer(false)
    }
  }

  if (!aberto) {
    return (
      <button type="button" onClick={() => void abrir()} className="mt-2 ml-3 text-xs text-zinc-500 underline transition-colors hover:text-[#D2A63C]">
        Canais
      </button>
    )
  }

  const comAlgo = canais ? (Object.keys(DESCREVER) as Array<keyof Canais>).filter((k) => (canais[k] ?? []).length > 0) : []
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-zinc-800 bg-black/20 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Canais</span>
        <button type="button" onClick={() => setAberto(false)} className="text-xs text-zinc-500 underline hover:text-zinc-300">fechar</button>
      </div>
      {aLer && <p className="text-xs text-zinc-500">a ler…</p>}
      {erro && <p className="text-xs text-red-400">{erro}</p>}
      {canais && comAlgo.length === 0 && (
        <p className="text-xs leading-relaxed text-zinc-500">Ainda não há registos desta pessoa noutros canais (pelo email, telefone, Instagram ou Telegram deste negócio).</p>
      )}
      {canais && comAlgo.map((k) => (
        <div key={k}>
          <p className="text-[11px] font-semibold text-zinc-400">
            {DESCREVER[k].nome}
            {ehDono && DESCREVER[k].href && <a href={DESCREVER[k].href} className="ml-2 font-normal text-[#D2A63C] underline">abrir</a>}
          </p>
          <ul className="mt-0.5 space-y-0.5">
            {canais[k].map((l, i) => <li key={i} className="text-xs text-zinc-400">{DESCREVER[k].linha(l)}</li>)}
          </ul>
        </div>
      ))}
    </div>
  )
}
