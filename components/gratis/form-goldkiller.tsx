'use client'
import { useState } from 'react'
import { CUPAO_FREEBIE } from '@/lib/freebies'
import { origemComAnuncio } from '@/components/captacao/contacto-rapido'
import { rastrear } from '@/lib/funis-pixel-browser'
import { ProximoPasso } from '@/components/ebooks/form-gratis'

const campo = 'w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white placeholder-white/35 outline-none focus:border-[#D2A63C]'

/** Formulário do GoldKiller grátis: cupão FREEBIE já preenchido, guia logo a seguir ao envio. */
export default function FormGoldKiller() {
  const [f, setF] = useState({ nome: '', email: '', indicativo: '+351', telefone: '', tvUsername: '', cupao: CUPAO_FREEBIE, aceito: false, site: '' })
  const [erros, setErros] = useState<Record<string, string>>({})
  const [estado, setEstado] = useState<'livre' | 'aenviar' | 'feito'>('livre')
  const [link, setLink] = useState<string | null>(null)
  const [erroGeral, setErroGeral] = useState('')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setEstado('aenviar'); setErros({}); setErroGeral('')
    try {
      const r = await fetch('/api/gratis/goldkiller', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...f, origem: origemComAnuncio('freebie:goldkiller', window.location.search) }) })
      const j = await r.json()
      if (j.ok) {
        setLink(j.link); setEstado('feito')
        rastrear('Lead', { content_name: 'GoldKiller grátis + Guia dos Scanners', content_category: 'freebie' })
        return
      }
      setErros(j.erros || {}); setErroGeral(j.erro || ''); setEstado('livre')
    } catch { setErroGeral('Sem ligação. Tenta outra vez.'); setEstado('livre') }
  }

  if (estado === 'feito') {
    return (
      <div className="rounded-2xl border border-[#D2A63C]/40 bg-black/40 p-6 text-center" style={{ ['--c' as string]: '#D2A63C' }}>
        <p className="text-xl font-bold text-white">Pedido recebido. 🎯</p>
        <p className="mt-2 text-white/70">A equipa ativa o GoldKiller no teu TradingView (@{f.tvUsername.replace(/^@/, '')}) em até 24 horas e avisa-te por email. Enquanto isso, começa pelo guia:</p>
        {link && <a href={link} className="mt-5 inline-block rounded-full bg-gradient-to-r from-[#E9C46A] to-[#D2A63C] px-7 py-3 font-bold text-black">Abrir o «Guia dos Scanners MTM»</a>}
        <ProximoPasso slug="guia-dos-scanners" />
      </div>
    )
  }

  const err = (k: string) => erros[k] && <p className="mt-1 text-sm text-red-300">{erros[k]}</p>
  return (
    <form onSubmit={enviar} className="space-y-4 text-left" noValidate>
      <input type="text" name="site" value={f.site} onChange={(e) => setF({ ...f, site: e.target.value })} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden />
      <div><input className={campo} placeholder="O teu nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} autoComplete="name" />{err('nome')}</div>
      <div><input className={campo} type="email" placeholder="O teu email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />{err('email')}</div>
      <div>
        <div className="flex gap-2">
          <input className={`${campo} w-24`} value={f.indicativo} onChange={(e) => setF({ ...f, indicativo: e.target.value })} aria-label="Indicativo" />
          <input className={campo} type="tel" placeholder="WhatsApp" value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} autoComplete="tel-national" />
        </div>
        {err('telefone')}
      </div>
      <div>
        <input className={campo} placeholder="Utilizador do TradingView (ex.: joaosilva)" value={f.tvUsername} onChange={(e) => setF({ ...f, tvUsername: e.target.value })} autoCapitalize="off" autoCorrect="off" />
        <p className="mt-1 text-xs text-white/45">É o nome que aparece no teu perfil do TradingView. A conta grátis chega.</p>
        {err('tvUsername')}
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-white/50">Cupão</label>
        <input className={`${campo} font-mono tracking-widest`} value={f.cupao} onChange={(e) => setF({ ...f, cupao: e.target.value.toUpperCase() })} />
        {err('cupao')}
      </div>
      <label className="flex items-start gap-3 text-sm text-white/70">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-[#D2A63C]" checked={f.aceito} onChange={(e) => setF({ ...f, aceito: e.target.checked })} />
        <span>Aceito que a MoreThanMoney me envie o guia e o acesso, e me contacte por email e WhatsApp. Posso sair a qualquer momento (responde SAIR).</span>
      </label>
      {err('aceito')}
      {erroGeral && <p className="text-sm text-red-300">{erroGeral}</p>}
      <button disabled={estado === 'aenviar'} className="w-full rounded-full bg-gradient-to-r from-[#E9C46A] to-[#D2A63C] px-7 py-4 font-bold text-black transition hover:brightness-110 disabled:opacity-50">
        {estado === 'aenviar' ? 'A enviar…' : 'Quero o GoldKiller 30 dias grátis'}
      </button>
    </form>
  )
}
