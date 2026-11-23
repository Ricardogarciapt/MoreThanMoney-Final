'use client'
import { useState } from 'react'
import { perguntasDe } from '@/lib/ebooks/gratis'
import { FREEBIES, PROXIMO_PASSO, freebieDe } from '@/lib/freebies'
import { origemComAnuncio } from '@/components/captacao/contacto-rapido'
import { rastrear } from '@/lib/funis-pixel-browser'

const campo = 'w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white placeholder-white/35 outline-none focus:border-[var(--c)]'

export default function FormGratis({ slug, titulo = 'O Método Frio' }: { slug: string; titulo?: string }) {
  const PERGUNTAS = perguntasDe(slug)
  const [f, setF] = useState({ nome: '', email: '', indicativo: '+351', telefone: '', aceito: false, site: '' })
  const [resp, setResp] = useState<Record<string, string>>({})
  const [erros, setErros] = useState<Record<string, string>>({})
  const [estado, setEstado] = useState<'livre' | 'aenviar' | 'feito'>('livre')
  const [link, setLink] = useState<string | null>(null)
  const [erroGeral, setErroGeral] = useState('')

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setEstado('aenviar'); setErros({}); setErroGeral('')
    try {
      const r = await fetch(`/api/ebooks/${slug}/gratis`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...f, respostas: resp, origem: origemComAnuncio(`ebook:${slug}`, window.location.search) }) })
      const j = await r.json()
      if (j.ok) {
        setLink(j.link); setEstado('feito')
        // Pixel só carrega com cookies aceites (mesma chave das /f/*): sem OK, isto não faz nada.
        rastrear('Lead', { content_name: titulo, content_category: 'freebie' })
        return
      }
      setErros(j.erros || {}); setErroGeral(j.erro || ''); setEstado('livre')
    } catch { setErroGeral('Sem ligação. Tenta outra vez.'); setEstado('livre') }
  }

  if (estado === 'feito') {
    return (
      <div className="rounded-2xl border border-[var(--c)]/40 bg-black/40 p-6 text-center">
        <p className="text-xl font-bold text-white">Está aqui o teu e-book. 📘</p>
        <p className="mt-2 text-white/65">Guarda este link: dá para abrir durante um ano, no telemóvel ou no computador.</p>
        {link && <a href={link} className="mt-5 inline-block rounded-full px-7 py-3 font-bold text-black" style={{ background: 'linear-gradient(90deg, var(--c), var(--c2))' }}>Abrir «{titulo}»</a>}
        {freebieDe(slug) && <ProximoPasso slug={slug} />}
      </div>
    )
  }

  const err = (k: string) => erros[k] && <p className="mt-1 text-sm text-red-300">{erros[k]}</p>
  return (
    <form onSubmit={enviar} className="space-y-4 text-left" noValidate>
      <input type="text" name="site" value={f.site} onChange={(e) => setF({ ...f, site: e.target.value })} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden />
      <div>
        <input className={campo} placeholder="O teu nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} autoComplete="name" />
        {err('nome')}
      </div>
      <div>
        <input className={campo} type="email" placeholder="O teu email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" />
        {err('email')}
      </div>
      <div>
        <div className="flex gap-2">
          <input className={`${campo} w-24`} value={f.indicativo} onChange={(e) => setF({ ...f, indicativo: e.target.value })} aria-label="Indicativo" />
          <input className={campo} type="tel" placeholder="WhatsApp" value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} autoComplete="tel-national" />
        </div>
        {err('telefone')}
      </div>
      {Object.keys(PERGUNTAS).map((k) => (
        <fieldset key={k}>
          <legend className="mb-2 text-sm font-semibold text-white/80">{PERGUNTAS[k].rotulo}</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(PERGUNTAS[k].opcoes).map(([val, rot]) => (
              <button type="button" key={val} onClick={() => setResp({ ...resp, [k]: val })}
                className={`rounded-full border px-4 py-2 text-sm transition ${resp[k] === val ? 'border-[var(--c)] bg-[var(--c)] text-black' : 'border-white/20 text-white/75 hover:border-white/40'}`}>
                {rot}
              </button>
            ))}
          </div>
          {err(k)}
        </fieldset>
      ))}
      <label className="flex items-start gap-3 text-sm text-white/70">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--c)]" checked={f.aceito} onChange={(e) => setF({ ...f, aceito: e.target.checked })} />
        <span>Aceito que a MoreThanMoney me envie o e-book e me contacte por email e WhatsApp. Posso sair a qualquer momento (responde SAIR).</span>
      </label>
      {err('aceito')}
      {erroGeral && <p className="text-sm text-red-300">{erroGeral}</p>}
      <button disabled={estado === 'aenviar'} className="w-full rounded-full border border-[var(--c)] px-7 py-4 font-bold text-[var(--c)] transition hover:bg-[var(--c)] hover:text-black disabled:opacity-50">
        {estado === 'aenviar' ? 'A enviar…' : 'Quero a versão grátis'}
      </button>
    </form>
  )
}

/** Depois de um freebie: o passo seguinte (Premium grátis, Membro) e os outros dois guias. */
export function ProximoPasso({ slug }: { slug: string }) {
  const outros = FREEBIES.filter((x) => x !== freebieDe(slug))
  return (
    <div className="mt-6 border-t border-white/10 pt-5 text-left">
      <p className="text-sm text-white/65">Também te enviámos o link por email. O passo seguinte, quando quiseres:</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={PROXIMO_PASSO.premiumGratis.href} className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black">{PROXIMO_PASSO.premiumGratis.texto}</a>
        <a href={PROXIMO_PASSO.membro.href} className="rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold text-white">{PROXIMO_PASSO.membro.texto}</a>
      </div>
      <p className="mt-5 text-sm text-white/65">Os outros guias grátis da coleção:</p>
      <ul className="mt-2 space-y-1 text-sm">
        {outros.map((o) => (
          <li key={o.slug}><a href={o.pagina} className="text-[var(--c)] underline-offset-4 hover:underline">{o.titulo}</a> <span className="text-white/45">· {o.gancho}</span></li>
        ))}
      </ul>
    </div>
  )
}
