'use client'

/**
 * «QUERO QUE ME LIGUEM» — o formulário reutilizável (landing, pilares, /upgrade, produtos, /ligar).
 *
 * Decisões que não são gosto:
 *  · três caixas SEPARADAS e DESMARCADAS (chamada, WhatsApp, email). Sem nenhuma marcada não se
 *    envia: não há consentimento, e o servidor recusa na mesma (lib/pedido-contacto.ts);
 *  · o texto de cada caixa é importado de `lib/pedido-contacto-textos.ts`, o mesmo que o servidor
 *    grava como prova. O ecrã e a prova são a mesma frase;
 *  · quem contacta e como se sai estão escritos por cima das caixas, não num link para outra página;
 *  · o `?ag=` do URL (ou o guardado no browser) e a origem seguem com o pedido;
 *  · ouro `#D2A63C` / `#E9C46A` sobre carvão, como os pilares. Nenhum número inventado.
 */
import { useEffect, useId, useState } from 'react'
import { Check, Loader2, Phone } from 'lucide-react'
import { codigoDeAgenteGuardado } from '@/lib/agentes/atribuicao-browser'
import {
  COMO_SAIR,
  INDICATIVOS,
  INTERESSES,
  MELHORES_HORAS,
  QUEM_CONTACTA,
  TEXTO_CAIXA,
  type CanalContacto,
  type Interesse,
  type MelhorHora,
} from '@/lib/pedido-contacto-textos'

const ROTULO_CANAL: Record<CanalContacto, string> = {
  chamada: 'Chamada',
  whatsapp: 'WhatsApp',
  email: 'Email',
}

export interface QueroQueMeLiguemProps {
  /** Onde está o formulário (página ou post). Um `?o=` no URL ganha a isto. */
  origem: string
  /** Código do agente por omissão, quando o URL não traz `?ag=` nem há um guardado. */
  ag?: string
  titulo?: string
  subtitulo?: string
  interesseInicial?: Interesse
  /** `secao` (com fundo e margens próprias) ou `solto` (dentro de outra página/cartão). */
  variante?: 'secao' | 'solto'
}

type Estado = 'idle' | 'enviando' | 'feito' | 'erro'

export default function QueroQueMeLiguem({
  origem,
  ag,
  titulo = 'Queres que te liguemos?',
  subtitulo = 'Deixa o teu número e escolhe como preferes ser contactado. Uma pessoa da equipa fala contigo sobre o que te interessa.',
  interesseInicial,
  variante = 'secao',
}: QueroQueMeLiguemProps) {
  const uid = useId()
  const [nome, setNome] = useState('')
  const [indicativo, setIndicativo] = useState('+351')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [interesse, setInteresse] = useState<Interesse | ''>(interesseInicial ?? '')
  const [melhorHora, setMelhorHora] = useState<MelhorHora>('qualquer')
  const [consent, setConsent] = useState<Record<CanalContacto, boolean>>({ chamada: false, whatsapp: false, email: false })
  const [site, setSite] = useState('') // honeypot
  const [estado, setEstado] = useState<Estado>('idle')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState('')
  const [ctx, setCtx] = useState<{ ag: string | null; origem: string }>({ ag: ag ?? null, origem })

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search)
      setCtx({
        ag: q.get('ag') || codigoDeAgenteGuardado() || ag || null,
        origem: q.get('o') || origem,
      })
    } catch {
      /* fica o que veio por props */
    }
  }, [ag, origem])

  const id = (n: string) => `${uid}-${n}`
  const algumCanal = consent.chamada || consent.whatsapp || consent.email

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErroGeral('')
    const locais: Record<string, string> = {}
    if (nome.trim().length < 2) locais.nome = 'Escreve o teu nome.'
    if (telefone.replace(/\D/g, '').length < 6) locais.telefone = 'Escreve o teu número.'
    if (!interesse) locais.interesse = 'Escolhe o que te interessa.'
    if (!algumCanal) locais.consentimentos = 'Marca pelo menos uma forma de contacto. Sem isso não te podemos contactar.'
    if (consent.email && !email.trim()) locais.email = 'Para aceitares email, escreve o teu email.'
    setErros(locais)
    if (Object.keys(locais).length) return

    setEstado('enviando')
    try {
      const r = await fetch('/api/pedido-contacto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome,
          indicativo,
          telefone,
          email: email.trim() || null,
          interesse,
          melhorHora,
          consentimentos: { chamada: consent.chamada === true, whatsapp: consent.whatsapp === true, email: consent.email === true },
          origem: ctx.origem,
          ag: ctx.ag,
          site,
        }),
      })
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; erros?: Record<string, string>; erro?: string }
      if (r.ok && j.ok) {
        setEstado('feito')
        return
      }
      if (j.erros) setErros(j.erros)
      setErroGeral(j.erro || (j.erros ? 'Revê os campos assinalados.' : 'Não foi possível enviar. Tenta outra vez.'))
      setEstado('erro')
    } catch {
      setErroGeral('Sem ligação. Tenta outra vez dentro de momentos.')
      setEstado('erro')
    }
  }

  const campo =
    'block w-full min-h-[46px] rounded-lg border border-white/[0.12] bg-white/[0.03] px-3.5 text-[16px] text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-[#D2A63C] focus:outline-none focus:ring-2 focus:ring-[#D2A63C]/30 aria-[invalid=true]:border-red-400/70'
  const rotulo = 'mb-1.5 block text-[13px] font-medium text-zinc-300'
  const erroCls = 'mt-1.5 text-[13px] text-red-300'

  const conteudo =
    estado === 'feito' ? (
      <div role="status" className="rounded-xl border border-[#D2A63C]/30 bg-[#D2A63C]/[0.06] p-6 sm:p-8">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#D2A63C] text-[#0A0A0B]">
          <Check className="h-5 w-5" aria-hidden="true" />
        </span>
        <h3 className="mt-4 text-xl font-semibold text-white">Pedido recebido</h3>
        <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-zinc-300">
          Vamos contactar-te só pelos canais que marcaste, de preferência na hora que escolheste. Se mudares de ideias,
          basta dizeres-nos e sais de todos os canais.
        </p>
      </div>
    ) : (
      <form onSubmit={enviar} noValidate className="grid gap-5" aria-describedby={erroGeral ? id('erro') : undefined}>
        {/* Honeypot: fora do ecrã e da navegação por teclado. Uma pessoa nunca o preenche. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label htmlFor={id('site')}>Website</label>
          <input id={id('site')} name="site" type="text" tabIndex={-1} autoComplete="off" value={site} onChange={(e) => setSite(e.target.value)} />
        </div>

        <div>
          <label htmlFor={id('nome')} className={rotulo}>Nome</label>
          <input
            id={id('nome')}
            className={campo}
            autoComplete="name"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            aria-invalid={!!erros.nome}
            aria-describedby={erros.nome ? id('nome-e') : undefined}
          />
          {erros.nome && <p id={id('nome-e')} className={erroCls}>{erros.nome}</p>}
        </div>

        <div>
          <label htmlFor={id('tel')} className={rotulo}>Telefone</label>
          <div className="grid grid-cols-[minmax(0,7.5rem)_1fr] gap-2">
            <label htmlFor={id('ind')} className="sr-only">Indicativo do país</label>
            <select id={id('ind')} className={campo} value={indicativo} onChange={(e) => setIndicativo(e.target.value)} autoComplete="tel-country-code">
              {INDICATIVOS.map((i) => (
                <option key={i.codigo} value={i.codigo} className="bg-[#111113]">
                  {i.codigo} {i.pais}
                </option>
              ))}
            </select>
            <input
              id={id('tel')}
              className={campo}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              aria-invalid={!!erros.telefone}
              aria-describedby={erros.telefone ? id('tel-e') : undefined}
            />
          </div>
          {erros.telefone && <p id={id('tel-e')} className={erroCls}>{erros.telefone}</p>}
        </div>

        <div>
          <label htmlFor={id('email')} className={rotulo}>
            Email <span className="font-normal text-zinc-500">(opcional)</span>
          </label>
          <input
            id={id('email')}
            className={campo}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!erros.email}
            aria-describedby={erros.email ? id('email-e') : undefined}
          />
          {erros.email && <p id={id('email-e')} className={erroCls}>{erros.email}</p>}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor={id('int')} className={rotulo}>O que te interessa</label>
            <select
              id={id('int')}
              className={campo}
              value={interesse}
              onChange={(e) => setInteresse(e.target.value as Interesse)}
              aria-invalid={!!erros.interesse}
              aria-describedby={erros.interesse ? id('int-e') : undefined}
            >
              <option value="" className="bg-[#111113]">Escolhe…</option>
              {Object.entries(INTERESSES).map(([k, v]) => (
                <option key={k} value={k} className="bg-[#111113]">{v}</option>
              ))}
            </select>
            {erros.interesse && <p id={id('int-e')} className={erroCls}>{erros.interesse}</p>}
          </div>
          <div>
            <label htmlFor={id('hora')} className={rotulo}>Melhor hora</label>
            <select id={id('hora')} className={campo} value={melhorHora} onChange={(e) => setMelhorHora(e.target.value as MelhorHora)}>
              {Object.entries(MELHORES_HORAS).map(([k, v]) => (
                <option key={k} value={k} className="bg-[#111113]">{v}</option>
              ))}
            </select>
          </div>
        </div>

        <fieldset aria-describedby={`${id('quem')}${erros.consentimentos ? ` ${id('cons-e')}` : ''}`}>
          <legend className="text-[13px] font-medium text-zinc-300">Como te podemos contactar</legend>
          <p id={id('quem')} className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">
            {QUEM_CONTACTA} {COMO_SAIR}
          </p>
          <div className="mt-3 grid gap-2">
            {(['chamada', 'whatsapp', 'email'] as CanalContacto[]).map((c) => (
              <label
                key={c}
                htmlFor={id(`c-${c}`)}
                className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 transition-colors ${
                  consent[c] ? 'border-[#D2A63C]/50 bg-[#D2A63C]/[0.06]' : 'border-white/10 hover:border-white/20'
                }`}
              >
                <input
                  id={id(`c-${c}`)}
                  type="checkbox"
                  checked={consent[c]}
                  onChange={(e) => setConsent((s) => ({ ...s, [c]: e.target.checked }))}
                  className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[#D2A63C]"
                />
                <span className="text-[14px] leading-snug text-zinc-200">
                  <span className="font-semibold text-white">{ROTULO_CANAL[c]}.</span> {TEXTO_CAIXA[c]}
                </span>
              </label>
            ))}
          </div>
          {erros.consentimentos && <p id={id('cons-e')} role="alert" className={erroCls}>{erros.consentimentos}</p>}
        </fieldset>

        {erroGeral && (
          <p id={id('erro')} role="alert" className="rounded-lg border border-red-400/30 bg-red-500/10 px-3.5 py-2.5 text-[14px] text-red-200">
            {erroGeral}
          </p>
        )}

        <button
          type="submit"
          disabled={estado === 'enviando'}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg bg-[#D2A63C] px-6 text-[15px] font-semibold text-[#0A0A0B] transition-[background-color,transform] hover:bg-[#E9C46A] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E9C46A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0B] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none sm:justify-self-start"
        >
          {estado === 'enviando' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Phone className="h-4 w-4" aria-hidden="true" />}
          {estado === 'enviando' ? 'A enviar…' : 'Quero que me liguem'}
        </button>
      </form>
    )

  const corpo = (
    <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:gap-14">
      <div className="md:pt-2">
        <h2 className="text-balance text-3xl font-semibold leading-[1.15] text-white sm:text-4xl">{titulo}</h2>
        <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-zinc-400">{subtitulo}</p>
        <p className="mt-6 max-w-[46ch] text-[13px] leading-relaxed text-zinc-500">
          Só usamos os canais que marcares. Os teus dados ficam na MoreThanMoney e não são vendidos nem cedidos.
          Vê a nossa <a href="/privacidade" className="text-[#E9C46A] underline-offset-2 hover:underline">política de privacidade</a>.
        </p>
      </div>
      <div className="relative">{conteudo}</div>
    </div>
  )

  if (variante === 'solto') return corpo
  return (
    <section id="ligar" aria-label="Quero que me liguem" className="border-t border-white/5 bg-[#0A0A0B] px-4 py-16 text-zinc-100 sm:px-6 sm:py-20">
      {corpo}
    </section>
  )
}
