'use client'

import { useState } from 'react'

type Inicial = {
  nome: string | null
  idioma: string | null
  capital_usd: number | string | null
  decisao: string | null
  opcao_pu_prime: string | null
  comentario: string | null
  respondido_em: string | null
}

const TEXTO = {
  pt: {
    ola: (n: string) => `Olá ${n}`,
    intro: 'Confirma aqui a tua resposta ao comunicado sobre o incidente de 10/09 no MTM Auto Premium.',
    condicoes: 'Condições da tua Conta Real MTM Funded',
    lista: (c: string) => [
      `Capital atribuído: ${c}, do Fundo MoreThanMoney, sem bónus nem crédito.`,
      'Capital não levantável durante 12 meses (até 22/09/2027).',
      'A conta segue o MTM Auto Edge e o Tap to Trade; podes negociar tu também.',
      'Se levantares ou receberes da PU Prime o teu depósito inicial, esse valor é subtraído desta conta na mesma proporção.',
    ],
    opcaoTitulo: 'Na PU Prime, que solução preferes?',
    opcoes: {
      estorno: 'Estorno de todas as operações até às 00:00 de 10/09',
      encerramento: 'Encerramento da conta e levantamento do meu depósito',
      separacao: 'Separação dos lucros e do depósito (depósito levantado, saldo positivo garantido, +100% de crédito)',
    },
    comentario: 'Comentário (opcional)',
    aceito: 'Aceito as condições',
    naoAceito: 'Não aceito',
    guardando: 'A guardar…',
    obrigado: 'Resposta guardada. Obrigado.',
    ja: (d: string) => `Respondeste a ${d}. Podes alterar a tua resposta abaixo.`,
    tua: { aceito: 'Aceitaste as condições.', nao_aceito: 'Não aceitaste as condições — vamos contactar-te.' },
  },
  en: {
    ola: (n: string) => `Hi ${n}`,
    intro: 'Please confirm your answer to our notice about the 10 September incident on MTM Auto Premium.',
    condicoes: 'Terms of your MTM Funded Real Account',
    lista: (c: string) => [
      `Capital assigned: ${c} from the MoreThanMoney Fund, with no bonus or credit.`,
      'Capital cannot be withdrawn for 12 months (until 22 Sep 2027).',
      'The account follows MTM Auto Edge and Tap to Trade; you can trade it yourself too.',
      'If you withdraw or receive your initial deposit from PU Prime, that amount is deducted from this account in the same proportion.',
    ],
    opcaoTitulo: 'At PU Prime, which solution do you prefer?',
    opcoes: {
      estorno: 'Reversal of all trades up to 00:00 on 10 September',
      encerramento: 'Close the account and withdraw my deposit',
      separacao: 'Separate profits from the deposit (deposit withdrawn, positive balance guaranteed, +100% credit)',
    },
    comentario: 'Comment (optional)',
    aceito: 'I accept the terms',
    naoAceito: 'I do not accept',
    guardando: 'Saving…',
    obrigado: 'Answer saved. Thank you.',
    ja: (d: string) => `You answered on ${d}. You can change your answer below.`,
    tua: { aceito: 'You accepted the terms.', nao_aceito: 'You did not accept the terms — we will contact you.' },
  },
}

export default function Formulario({ token, inicial }: { token: string; inicial: Inicial }) {
  const lang = inicial.idioma === 'en' ? 'en' : 'pt'
  const t = TEXTO[lang]
  const [opcao, setOpcao] = useState(inicial.opcao_pu_prime ?? '')
  const [comentario, setComentario] = useState(inicial.comentario ?? '')
  const [estado, setEstado] = useState<'livre' | 'a_guardar' | 'guardado'>('livre')
  const [decisao, setDecisao] = useState(inicial.decisao)
  const [erro, setErro] = useState('')

  const capital = inicial.capital_usd != null
    ? (lang === 'en' ? '$' : '') + Number(inicial.capital_usd).toLocaleString(lang === 'en' ? 'en-US' : 'pt-PT', { minimumFractionDigits: 2 }) + (lang === 'en' ? '' : ' $')
    : '—'

  async function responder(d: 'aceito' | 'nao_aceito') {
    setEstado('a_guardar'); setErro('')
    const r = await fetch('/api/incidente-10-09', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, decisao: d, opcao, comentario }),
    }).then((x) => x.json()).catch(() => ({ ok: false, erro: 'sem ligação' }))
    if (r.ok) { setDecisao(d); setEstado('guardado') } else { setErro(r.erro ?? 'erro'); setEstado('livre') }
  }

  const quando = inicial.respondido_em ? new Date(inicial.respondido_em).toLocaleString(lang === 'en' ? 'en-GB' : 'pt-PT') : null

  return (
    <div className="rounded-2xl border border-[#D2A63C]/30 bg-[#141414] p-6">
      <h1 className="text-xl font-bold">{t.ola(inicial.nome ?? '')}</h1>
      <p className="mt-2 text-sm text-[#bdb6a6]">{t.intro}</p>
      {quando && estado !== 'guardado' && <p className="mt-3 rounded-lg bg-[#D2A63C]/10 px-3 py-2 text-sm text-[#F4D03F]">{t.ja(quando)}</p>}

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-[#D2A63C]">{t.condicoes}</h2>
      <ul className="mt-2 space-y-2 text-sm">
        {t.lista(capital).map((l) => <li key={l} className="flex gap-2"><span className="text-[#D2A63C]">•</span><span>{l}</span></li>)}
      </ul>

      <h2 className="mt-6 text-sm font-semibold uppercase tracking-wider text-[#D2A63C]">{t.opcaoTitulo}</h2>
      <div className="mt-2 space-y-2">
        {(Object.keys(t.opcoes) as Array<keyof typeof t.opcoes>).map((k) => (
          <label key={k} className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${opcao === k ? 'border-[#D2A63C] bg-[#D2A63C]/10' : 'border-white/10'}`}>
            <input type="radio" name="opcao" value={k} checked={opcao === k} onChange={() => setOpcao(k)} className="mt-0.5 accent-[#D2A63C]" />
            <span>{t.opcoes[k]}</span>
          </label>
        ))}
      </div>

      <label className="mt-5 block text-sm">
        <span className="text-[#bdb6a6]">{t.comentario}</span>
        <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3} maxLength={2000}
          className="mt-1 w-full rounded-xl border border-white/10 bg-[#0a0a0a] p-3 text-sm outline-none focus:border-[#D2A63C]" />
      </label>

      {estado === 'guardado' ? (
        <p className="mt-6 rounded-xl bg-emerald-500/10 p-4 text-center text-sm font-semibold text-emerald-300">
          {t.obrigado} {decisao ? t.tua[decisao as 'aceito' | 'nao_aceito'] : ''}
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button type="button" disabled={estado === 'a_guardar'} onClick={() => responder('aceito')}
            className="flex-1 rounded-xl bg-gradient-to-r from-[#D2A63C] to-[#BB8525] px-5 py-3 font-bold text-black disabled:opacity-60">
            {estado === 'a_guardar' ? t.guardando : t.aceito}
          </button>
          <button type="button" disabled={estado === 'a_guardar'} onClick={() => responder('nao_aceito')}
            className="flex-1 rounded-xl border border-white/20 px-5 py-3 font-semibold disabled:opacity-60">
            {t.naoAceito}
          </button>
        </div>
      )}
      {erro && <p className="mt-3 text-center text-sm text-red-400">{erro}</p>}
    </div>
  )
}
