'use client'

/**
 * /ativar-premium — o fecho do período grátis.
 *
 * Quem acabou os 3 dias grátis (ou os 90 dias da campanha) sem método de pagamento chega aqui
 * pelo middleware e pelo login (`inactive_reason = 'trial_sem_pagamento'`, ver
 * lib/periodos-gratis.ts). Um botão: abre o Stripe Checkout do Premium a 65 €/mês, sem novo
 * trial nem desconto de entrada. Visual: o do /upgrade (ouro sobre carvão), sem componentes novos.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Loader2, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'

const BENEFICIOS = [
  'Acesso completo à app MTM System',
  'Ferramentas de trading + Scanner',
  'Live Sessions e comunidade',
  'Alertas e sinais em tempo real',
  'Cancelas quando quiseres, sem compromisso',
]

export default function AtivarPremiumPage() {
  const [email, setEmail] = useState<string | null>(null)
  const [aCarregar, setACarregar] = useState(false)
  const [erro, setErro] = useState('')
  const [semSessao, setSemSessao] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) setSemSessao(true)
      else setEmail(data.session.user.email ?? null)
    })
  }, [])

  const ativar = async () => {
    setErro('')
    setACarregar(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) {
        window.location.href = '/login?redirect=/ativar-premium'
        return
      }
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planId: 'premium_monthly', email, trial: false }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.url) {
        setErro(json.error || 'Não foi possível abrir o pagamento. Tenta de novo.')
        setACarregar(false)
        return
      }
      window.location.href = json.url
    } catch {
      setErro('Sem ligação. Tenta de novo.')
      setACarregar(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-[#D2A63C]/30 bg-gray-900/60 p-6 sm:p-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#D2A63C]/15">
          <Lock className="h-6 w-6 text-[#D2A63C]" />
        </div>
        <h1 className="text-center text-2xl font-bold">O teu período grátis terminou</h1>
        <p className="mt-2 text-center text-sm text-gray-400">
          Para continuares com acesso, ativa o Premium. Inseres o método de pagamento no Stripe e a
          subscrição fica a 65 €/mês.
        </p>

        <ul className="mt-6 space-y-2.5">
          {BENEFICIOS.map((b) => (
            <li key={b} className="flex items-start gap-2.5 text-sm text-gray-200">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#D2A63C]" />
              {b}
            </li>
          ))}
        </ul>

        {semSessao ? (
          <Button asChild className="mt-6 w-full py-5 font-bold text-black" style={{ background: 'linear-gradient(135deg, #D2A63C, #BB8525)' }}>
            <Link href="/login?redirect=/ativar-premium">Inicia sessão para ativares</Link>
          </Button>
        ) : (
          <Button
            onClick={ativar}
            disabled={aCarregar}
            className="mt-6 w-full py-5 font-bold text-black"
            style={{ background: 'linear-gradient(135deg, #D2A63C, #BB8525)' }}
          >
            {aCarregar ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />A abrir o pagamento…</> : 'Ativar Premium · 65 €/mês'}
          </Button>
        )}
        {erro && <p className="mt-3 text-center text-sm text-red-400">{erro}</p>}

        <p className="mt-4 text-center text-[11px] text-gray-500">
          Pagamento seguro pelo Stripe. Cancelas quando quiseres, sem fidelização. Conteúdo
          educativo, não constitui consultoria financeira.
        </p>
      </div>
    </main>
  )
}
