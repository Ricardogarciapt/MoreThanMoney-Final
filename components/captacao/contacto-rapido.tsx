'use client'

/**
 * Contacto rápido (22/11/2026) — o formulário curto para quem chega de um anúncio.
 *
 * Porquê: ~110 visitas pagas em 3 dias e 0 contactos. O «Quero que me liguem» completo pede 7 campos
 * e 3 caixas e estava no fundo da página. Este pede só NOME + WHATSAPP, fica acima da dobra e tem ao
 * lado um botão para abrir o WhatsApp de imediato.
 *
 * O que não muda (as regras do consentimento):
 *  · a caixa do WhatsApp nasce DESMARCADA e o texto é o de `TEXTO_CAIXA.whatsapp`, o mesmo que o
 *    servidor grava como prova (lib/pedido-contacto.ts). Sem ela marcada, nada se envia;
 *  · entra pela mesma porta: POST /api/pedido-contacto → pedidos_contacto + captacao_consentimento
 *    + tarefa do setter + aviso no Telegram;
 *  · a origem leva o anúncio (utm_* ou, sem UTM, `s=meta` quando há `fbclid`).
 */
import { useEffect, useId, useState } from 'react'
import { Check, Loader2, MessageCircle } from 'lucide-react'
import { codigoDeAgenteGuardado } from '@/lib/agentes/atribuicao-browser'
import { INDICATIVOS, TEXTO_CAIXA, COMO_SAIR, QUEM_CONTACTA, type Interesse } from '@/lib/pedido-contacto-textos'

export const WHATSAPP_MTM = '351912666699'

export function linkWhatsApp(texto: string): string {
  return `https://wa.me/${WHATSAPP_MTM}?text=${encodeURIComponent(texto)}`
}

const so = (v: string | null) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[^\w\-.]/g, '')
    .slice(0, 40)

/** `base?s=&c=&a=` a partir do URL; `s=meta` quando o clique veio da Meta sem UTM. */
export function origemComAnuncio(base: string, search: string): string {
  try {
    const q = new URLSearchParams(search)
    const s = so(q.get('utm_source')) || (q.get('fbclid') ? 'meta' : '')
    const partes: string[] = []
    if (s) partes.push(`s=${s}`)
    const c = so(q.get('utm_campaign'))
    const a = so(q.get('utm_content'))
    if (c) partes.push(`c=${c}`)
    if (a) partes.push(`a=${a}`)
    return `${base}${partes.length ? `?${partes.join('&')}` : ''}`.slice(0, 120)
  } catch {
    return base
  }
}

export interface ContactoRapidoProps {
  /** Origem base (ex.: `funil:educacao`). O anúncio junta-se no browser. */
  origem: string
  interesse: Interesse
  ag?: string
  /** Mensagem pré-escrita do botão de WhatsApp. */
  mensagemWhatsapp: string
  textoBotao?: string
  onLead?: () => void
  onWhatsapp?: () => void
}

type Estado = 'idle' | 'enviando' | 'feito'

export default function ContactoRapido({
  origem,
  interesse,
  ag,
  mensagemWhatsapp,
  textoBotao = 'Quero que falem comigo',
  onLead,
  onWhatsapp,
}: ContactoRapidoProps) {
  const uid = useId()
  const [nome, setNome] = useState('')
  const [indicativo, setIndicativo] = useState('+351')
  const [telefone, setTelefone] = useState('')
  const [aceito, setAceito] = useState(false)
  const [site, setSite] = useState('') // honeypot
  const [estado, setEstado] = useState<Estado>('idle')
  const [erro, setErro] = useState('')
  const [ctx, setCtx] = useState({ origem, ag: ag ?? null as string | null })

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search)
      setCtx({ origem: origemComAnuncio(origem, window.location.search), ag: q.get('ag') || codigoDeAgenteGuardado() || ag || null })
    } catch {
      /* fica o que veio por props */
    }
  }, [origem, ag])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (nome.trim().length < 2) return setErro('Escreve o teu nome.')
    if (telefone.replace(/\D/g, '').length < 6) return setErro('Escreve o teu número de WhatsApp.')
    if (!aceito) return setErro('Marca a caixa para te podermos mandar mensagem.')
    setEstado('enviando')
    try {
      const r = await fetch('/api/pedido-contacto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome,
          indicativo,
          telefone,
          email: null,
          interesse,
          melhorHora: 'qualquer',
          consentimentos: { chamada: false, whatsapp: aceito === true, email: false },
          origem: ctx.origem,
          ag: ctx.ag,
          site,
        }),
      })
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; erros?: Record<string, string>; erro?: string }
      if (r.ok && j.ok) {
        setEstado('feito')
        try {
          onLead?.()
        } catch {
          /* a medição nunca estraga o pedido */
        }
        return
      }
      setErro(j.erro || (j.erros ? Object.values(j.erros)[0] : '') || 'Não foi possível enviar. Tenta outra vez.')
      setEstado('idle')
    } catch {
      setErro('Sem ligação. Tenta outra vez dentro de momentos.')
      setEstado('idle')
    }
  }

  const wa = linkWhatsApp(mensagemWhatsapp)
  const botaoWa = (
    <a
      href={wa}
      target="_blank"
      rel="noopener"
      onClick={() => {
        try {
          onWhatsapp?.()
        } catch {
          /* nada */
        }
      }}
      className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-[#25D366]/50 bg-[#25D366]/10 px-5 text-[15px] font-semibold text-white transition hover:bg-[#25D366]/20 active:scale-[0.98]"
    >
      <MessageCircle className="h-4 w-4 text-[#25D366]" aria-hidden="true" />
      Falar já no WhatsApp
    </a>
  )

  if (estado === 'feito') {
    return (
      <div role="status" className="rounded-xl border border-[#D2A63C]/30 bg-[#D2A63C]/[0.06] p-5">
        <p className="flex items-center gap-2 text-[16px] font-semibold text-white">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#D2A63C] text-[#0A0A0B]">
            <Check className="h-4 w-4" aria-hidden="true" />
          </span>
          Recebido, {nome.trim().split(' ')[0]}!
        </p>
        <p className="mt-2 text-[14px] leading-relaxed text-zinc-300">
          Não precisas de esperar: ativa já os teus dias grátis (só cobra no fim e cancelas quando quiseres). Também te mandamos mensagem no WhatsApp.
        </p>
        <a
          href="/register?plan=premium&utm_source=contacto-rapido"
          className="mt-4 flex min-h-[48px] items-center justify-center rounded-lg bg-[#D2A63C] px-4 text-[15px] font-semibold text-[#0A0A0B] hover:bg-[#E9C46A]"
        >
          Ativar o acesso grátis agora
        </a>
        <div className="mt-3">{botaoWa}</div>
      </div>
    )
  }

  const campo =
    'block w-full min-h-[48px] rounded-lg border border-white/[0.14] bg-white/[0.04] px-3.5 text-[16px] text-zinc-100 placeholder:text-zinc-500 focus:border-[#D2A63C] focus:outline-none focus:ring-2 focus:ring-[#D2A63C]/30'

  return (
    <form onSubmit={enviar} noValidate className="relative grid gap-3" aria-label="Deixa o teu contacto">
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${uid}-site`}>Website</label>
        <input id={`${uid}-site`} tabIndex={-1} autoComplete="off" value={site} onChange={(e) => setSite(e.target.value)} />
      </div>
      <label htmlFor={`${uid}-nome`} className="sr-only">Nome</label>
      <input id={`${uid}-nome`} className={campo} placeholder="O teu nome" autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} />
      <div className="grid grid-cols-[6.5rem_1fr] gap-2">
        <label htmlFor={`${uid}-ind`} className="sr-only">Indicativo</label>
        <select id={`${uid}-ind`} className={campo} value={indicativo} onChange={(e) => setIndicativo(e.target.value)} autoComplete="tel-country-code">
          {INDICATIVOS.map((i) => (
            <option key={i.codigo} value={i.codigo} className="bg-[#111113]">
              {i.codigo} {i.pais}
            </option>
          ))}
        </select>
        <label htmlFor={`${uid}-tel`} className="sr-only">WhatsApp</label>
        <input
          id={`${uid}-tel`}
          className={campo}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="O teu WhatsApp"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
        />
      </div>
      <label htmlFor={`${uid}-ok`} className="flex cursor-pointer items-start gap-2.5 text-[12.5px] leading-snug text-zinc-400">
        <input
          id={`${uid}-ok`}
          type="checkbox"
          checked={aceito}
          onChange={(e) => setAceito(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[#D2A63C]"
        />
        <span title={`${QUEM_CONTACTA} ${COMO_SAIR}`}>
          {TEXTO_CAIXA.whatsapp}{' '}
          <a href="/privacidade" className="underline underline-offset-2 hover:text-zinc-200">Privacidade</a>
        </span>
      </label>
      {erro && (
        <p role="alert" className="text-[13px] text-red-300">
          {erro}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="submit"
          disabled={estado === 'enviando'}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg bg-[#D2A63C] px-5 text-[15px] font-semibold text-[#0A0A0B] transition hover:bg-[#E9C46A] active:scale-[0.98] disabled:opacity-60"
        >
          {estado === 'enviando' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {estado === 'enviando' ? 'A enviar…' : textoBotao}
        </button>
        {botaoWa}
      </div>
    </form>
  )
}
