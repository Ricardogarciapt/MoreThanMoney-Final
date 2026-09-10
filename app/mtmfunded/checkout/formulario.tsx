'use client'

import Link from 'next/link'
import { useState } from 'react'

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
export default function FormularioCheckout({ slug }: { slug: string }) {
  const [dados, setDados] = useState({ nome: '', telefone: '', dataNascimento: '' })
  const [aceita, setAceita] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const completo =
    dados.nome.trim().length > 2 &&
    dados.telefone.replace(/\D/g, '').length >= 9 &&
    dados.dataNascimento &&
    aceita

  const pagar = async () => {
    setErro(null)
    setOcupado(true)
    try {
      const { getAccessToken } = await import('@/lib/auth-token')
      const tok = await getAccessToken()
      if (!tok) {
        window.location.href = `/login?redirect=${encodeURIComponent(`/mtmfunded/checkout?programa=${slug}`)}`
        return
      }
      const r = await fetch('/api/mtmfunded/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ programa: slug, ...dados }),
      })
      const j = await r.json()
      if (!r.ok || !j?.url) throw new Error(j?.error || 'Não foi possível abrir o pagamento')
      window.location.href = j.url
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir o pagamento')
      setOcupado(false)
    }
  }

  const campo = (
    chave: keyof typeof dados,
    rotulo: string,
    nota: string,
    tipo = 'text',
  ) => (
    <label className="block">
      <span className="text-sm text-zinc-300">{rotulo}</span>
      <span className="mt-0.5 block text-xs text-zinc-600">{nota}</span>
      <input
        type={tipo}
        value={dados[chave]}
        onChange={(e) => setDados({ ...dados, [chave]: e.target.value })}
        className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-[#D2A63C]"
      />
    </label>
  )

  return (
    <div className="mt-8 space-y-5">
      {campo('nome', 'Nome completo', 'Como vai ficar na conta.')}
      {campo('telefone', 'Telemóvel', 'Pedido pela corretora no formulário da conta.', 'tel')}
      {campo('dataNascimento', 'Data de nascimento', 'Também exigida pela corretora. Tens de ser maior de idade.', 'date')}

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
        {ocupado ? 'A abrir o pagamento…' : 'Pagar e começar'}
      </button>

      <p className="text-center text-xs text-zinc-600">
        Pagamento processado pela Stripe. Não guardamos dados de cartão.
      </p>
    </div>
  )
}
