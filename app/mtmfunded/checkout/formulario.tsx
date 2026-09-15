'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useT } from '@/components/i18n-provider'
import { PRAZO_MT5_HORAS, type Plataforma } from '@/lib/mtmfunded/plataforma'
import {
  CamposConta, DADOS_CONTA_VAZIOS, dadosContaCompletos, type DadosConta,
} from '@/components/mtmfunded/campos-conta'

/**
 * Os dados pedem-se ANTES do pagamento, e não depois.
 *
 * São os mesmos três que o torneio pede — nome, telemóvel e data de nascimento — porque são
 * os que a corretora exige no formulário da conta. Pedi-los depois de a pessoa pagar
 * deixava-a paga e sem conta, à espera de um email nosso a pedir-lhe o telemóvel.
 *
 * O aviso das 14 dias está aqui, à vista, e não escondido nos termos: a lei manda dizê-lo
 * antes da compra, e é antes da compra que ele muda alguma coisa para quem está a decidir.
 */
export default function FormularioCheckout({
  slug, precoCents, plataformas,
}: { slug: string; precoCents: number; plataformas: Plataforma[] }) {
  const t = useT()
  // A primeira disponível é a recomendada (MTM Funded, quando lançada). O servidor revalida.
  const [plataforma, setPlataforma] = useState<Plataforma>(plataformas[0] ?? 'mt5')
  const [dados, setDados] = useState<DadosConta>(DADOS_CONTA_VAZIOS)
  const [aceita, setAceita] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  // ── cupão ─────────────────────────────────────────────────────────────────
  const [cupao, setCupao] = useState('')
  const [desconto, setDesconto] = useState<{ pct: number; cents: number } | null>(null)
  const [erroCupao, setErroCupao] = useState<string | null>(null)
  const [aVerificar, setAVerificar] = useState(false)

  const verificarCupao = async () => {
    setErroCupao(null)
    setAVerificar(true)
    try {
      const r = await fetch('/api/mtmfunded/cupao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programa: slug, codigo: cupao }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || 'Cupão inválido')
      setDesconto({ pct: j.descontoPct, cents: j.centsFinais })
    } catch (e) {
      setDesconto(null)
      setErroCupao(e instanceof Error ? e.message : 'Cupão inválido')
    } finally {
      setAVerificar(false)
    }
  }

  const euros = (c: number) => (c / 100).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })
  const completo = dadosContaCompletos(dados) && aceita

  const pagar = async () => {
    setErro(null)
    setOcupado(true)
    try {
      const { getAccessToken } = await import('@/lib/auth-token')
      const tok = await getAccessToken()
      if (!tok) {
        window.location.href = `/mtmfunded/entrar?redirect=${encodeURIComponent(`/mtmfunded/checkout?programa=${slug}`)}`
        return
      }
      const r = await fetch('/api/mtmfunded/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ programa: slug, plataforma, ...dados, cupao: desconto ? cupao : undefined }),
      })
      const j = await r.json()
      if (!r.ok || !j?.url) throw new Error(j?.error || 'Não foi possível abrir o pagamento')
      window.location.href = j.url
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir o pagamento')
      setOcupado(false)
    }
  }

  return (
    <div className="mt-8 space-y-5">
      {/* ── Plataforma ─────────────────────────────────────────────────────── */}
      <fieldset>
        <legend className="text-xs uppercase tracking-widest text-zinc-600">{t('mtmfunded.plataforma.titulo')}</legend>
        <div className={`mt-3 grid gap-3 ${plataformas.length > 1 ? 'sm:grid-cols-2' : ''}`}>
          {plataformas.map((p) => {
            const ativa = plataforma === p
            return (
              <label
                key={p}
                className={`flex cursor-pointer gap-3 rounded-xl border p-4 transition-colors ${
                  ativa ? 'border-[#D2A63C] bg-[#D2A63C]/[0.06]' : 'border-zinc-800 bg-zinc-950/60 hover:border-zinc-700'
                }`}
              >
                <input
                  type="radio"
                  name="plataforma"
                  value={p}
                  checked={ativa}
                  onChange={() => setPlataforma(p)}
                  className="mt-1 h-4 w-4 shrink-0 accent-[#D2A63C]"
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                    {p === 'mtmfunded' ? 'MTM Funded' : 'MetaTrader 5'}
                    {p === 'mtmfunded' && (
                      <span className="rounded-full bg-[#D2A63C]/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[#D2A63C]">
                        {t('mtmfunded.plataforma.recomendada')}
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-zinc-400">
                    {p === 'mtmfunded'
                      ? t('mtmfunded.plataforma.simNota')
                      : t('mtmfunded.plataforma.mt5Nota').replace('{h}', String(PRAZO_MT5_HORAS))}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">{t('mtmfunded.plataforma.igual')}</p>
      </fieldset>

      <p className="text-xs uppercase tracking-widest text-zinc-600">
        Dados da conta · pedidos pela corretora
      </p>
      <CamposConta dados={dados} onChange={setDados} />

      {/* O cupão fica ANTES da aceitação: o preço tem de estar certo quando se aceita. */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
        <p className="text-sm text-zinc-300">Tens um cupão?</p>
        <div className="mt-2 flex gap-2">
          <input
            value={cupao}
            onChange={(e) => { setCupao(e.target.value.toUpperCase()); setDesconto(null) }}
            onKeyDown={(e) => e.key === 'Enter' && verificarCupao()}
            placeholder="CÓDIGO"
            className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-black/40 px-3 py-2.5 font-mono text-sm uppercase text-white outline-none focus:border-[#D2A63C]"
          />
          <button
            onClick={verificarCupao}
            disabled={!cupao.trim() || aVerificar}
            className="rounded-lg border border-zinc-700 px-4 text-sm text-zinc-300 disabled:opacity-40"
          >
            {aVerificar ? '…' : 'Aplicar'}
          </button>
        </div>
        {erroCupao && <p className="mt-2 text-sm text-red-400">{erroCupao}</p>}
        {desconto && (
          <p className="mt-3 flex flex-wrap items-baseline gap-2 text-sm">
            <span className="text-emerald-400">−{desconto.pct}%</span>
            <span className="text-zinc-500 line-through">{euros(precoCents)}</span>
            <span className="text-lg font-bold text-[#D2A63C]">{euros(desconto.cents)}</span>
          </p>
        )}
      </div>

      <label className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
        <input
          type="checkbox"
          checked={aceita}
          onChange={(e) => setAceita(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#D2A63C]"
        />
        <span className="text-xs leading-relaxed text-zinc-400">
          Peço que a conta seja emitida de imediato e aceito que, com isso, o direito de livre
          resolução de 14 dias se extingue assim que ela for emitida. Li os{' '}
          <Link href="/mtmfunded/legal/termos" className="text-[#D2A63C] hover:underline">Termos</Link>,
          o{' '}
          <Link href="/mtmfunded/legal/risco" className="text-[#D2A63C] hover:underline">Aviso de Risco</Link>{' '}
          e a{' '}
          <Link href="/mtmfunded/legal/reembolsos" className="text-[#D2A63C] hover:underline">
            Política de Reembolsos
          </Link>
          , e percebo que a conta é <b className="text-zinc-300">simulada</b>.
        </span>
      </label>

      {erro && <p className="text-sm text-red-400">{erro}</p>}

      <button
        onClick={pagar}
        disabled={!completo || ocupado}
        className="w-full rounded-lg bg-[#D2A63C] py-3.5 text-sm font-semibold text-black disabled:opacity-40"
      >
        {ocupado
          ? 'A abrir o pagamento…'
          : `Proceder para o pagamento · ${euros(desconto ? desconto.cents : precoCents)}`}
      </button>

      <p className="text-center text-xs text-zinc-600">
        Pagamento processado pela Stripe. Não guardamos dados de cartão.
      </p>
    </div>
  )
}
