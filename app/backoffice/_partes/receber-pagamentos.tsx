'use client'

/**
 * RECEBER AS COMISSÕES — o cartão onde afiliados, IBs, setters, closers e prospectores põem os
 * dados de recebimento (Stripe Connect). Com a conta completa, o que o dono aprovar é transferido
 * no ciclo diário seguinte, depois dos 30 dias em que o cliente pode pedir o dinheiro de volta.
 */
import { useCallback, useEffect, useState } from 'react'

type Estado = 'not_started' | 'incomplete' | 'pending' | 'complete' | 'error'

const PAISES: Array<[string, string]> = [
  ['PT', 'Portugal'], ['ES', 'Espanha'], ['FR', 'França'], ['DE', 'Alemanha'], ['IT', 'Itália'],
  ['NL', 'Países Baixos'], ['BE', 'Bélgica'], ['LU', 'Luxemburgo'], ['IE', 'Irlanda'], ['CH', 'Suíça'],
  ['GB', 'Reino Unido'], ['AT', 'Áustria'], ['PL', 'Polónia'],
]

export function ReceberPagamentos() {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [pais, setPais] = useState('PT')
  const [aAbrir, setAAbrir] = useState(false)
  const [erro, setErro] = useState('')

  const ler = useCallback(async () => {
    try {
      const r = await fetch('/api/affiliate/stripe-connect', { cache: 'no-store' })
      const d = await r.json()
      setEstado((d.status as Estado) || 'not_started')
    } catch {
      setEstado('not_started')
    }
  }, [])

  useEffect(() => {
    ler()
  }, [ler])

  const abrir = async () => {
    setAAbrir(true)
    setErro('')
    try {
      const r = await fetch('/api/affiliate/stripe-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: estado === 'not_started' || estado === 'error' ? 'create' : 'refresh',
          pais,
          voltar: 'backoffice',
        }),
      })
      const d = await r.json()
      if (d.onboarding_url) {
        window.location.href = d.onboarding_url
        return
      }
      setErro(d.error || 'Não foi possível abrir agora. Tenta daqui a pouco.')
    } catch {
      setErro('Não foi possível abrir agora. Tenta daqui a pouco.')
    }
    setAAbrir(false)
  }

  if (estado === null) return null

  if (estado === 'complete') {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
        <p className="font-semibold text-emerald-300">Dados de recebimento prontos ✅</p>
        <p className="mt-1 text-gray-400">
          As comissões aprovadas são transferidas para a tua conta no ciclo diário, 30 dias depois de o cliente pagar.
        </p>
      </div>
    )
  }

  const titulo = estado === 'pending' ? 'O Stripe está a validar os teus dados' : 'Preenche os teus dados para receber'
  const texto =
    estado === 'pending'
      ? 'Se o Stripe te pediu mais algum documento, continua o registo aqui.'
      : 'Leva 3 minutos: identificação e IBAN, num formulário seguro do Stripe. Sem isto, as tuas comissões ficam aprovadas mas não podem ser transferidas.'

  return (
    <div className="rounded-2xl border border-[#D2A63C]/30 bg-[#D2A63C]/5 p-4 text-sm">
      <p className="font-semibold text-[#E9C46A]">{titulo}</p>
      <p className="mt-1 text-gray-400">{texto}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(estado === 'not_started' || estado === 'error') && (
          <select
            value={pais}
            onChange={(e) => setPais(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-gray-200"
            aria-label="País da conta bancária"
          >
            {PAISES.map(([c, n]) => (
              <option key={c} value={c}>{n}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={abrir}
          disabled={aAbrir}
          className="rounded-lg bg-[#D2A63C] px-4 py-2 font-semibold text-black hover:bg-[#E9C46A] disabled:opacity-60"
        >
          {aAbrir ? 'A abrir…' : estado === 'pending' ? 'Continuar registo' : 'Preencher dados de recebimento'}
        </button>
      </div>
      {erro && <p className="mt-2 text-red-400">{erro}</p>}
    </div>
  )
}
