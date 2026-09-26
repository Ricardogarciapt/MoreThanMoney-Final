'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * A caixa onde se cola a exportação da corretora.
 *
 * PORQUE É QUE SE COLA E NÃO SE TRANSCREVE
 * As quatro corretoras exportam ficheiros diferentes, todos os meses, com centenas de linhas. Ter
 * alguém (eu incluído) a copiar esses números à mão é como se introduzem erros em dados de
 * clientes — e uma vírgula mal copiada numa coluna de comissão é dinheiro mal pago a uma pessoa
 * real. Colar é exacto, é rápido, e repete-se no mês seguinte sem trabalho nenhum.
 *
 * O formato é reconhecido sozinho pelo cabeçalho, por isso não há nada a escolher: cola-se o que
 * vem da corretora e pronto.
 */
export function Importar() {
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState<'parado' | 'a-enviar'>('parado')
  const [resposta, setResposta] = useState<string | null>(null)
  const [falhou, setFalhou] = useState(false)
  const router = useRouter()

  async function enviar() {
    setEstado('a-enviar')
    setResposta(null)
    setFalhou(false)
    try {
      const r = await fetch('/api/backoffice/ib/importar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto }),
      })
      const d = (await r.json()) as {
        error?: string
        corretora?: string
        guardadas?: number
        novas?: number
        atualizadas?: number
        semConta?: number
      }
      if (!r.ok) {
        setFalhou(true)
        setResposta(d.error ?? 'Não deu para importar.')
      } else {
        setResposta(
          `${d.corretora}: ${d.guardadas} contas guardadas` +
            (d.novas ? ` · ${d.novas} novas` : '') +
            (d.atualizadas ? ` · ${d.atualizadas} actualizadas` : '') +
            (d.semConta ? ` · ${d.semConta} linhas sem conta, ignoradas` : ''),
        )
        setTexto('')
        router.refresh()
      }
    } catch {
      setFalhou(true)
      setResposta('Não consegui falar com o servidor.')
    }
    setEstado('parado')
  }

  return (
    <section className="space-y-3 rounded-xl border border-gray-800 bg-gray-900/40 p-5">
      <div>
        <h2 className="font-semibold text-white">Importar exportação de corretora</h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-400">
          Cola a exportação tal como sai do painel da corretora, <strong>com a linha dos títulos</strong>.
          Uma corretora de cada vez. Reconheço a PU Prime, a Infinox (clientes e referências), a
          Hantec e a VT Markets.
        </p>
      </div>

      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={6}
        spellCheck={false}
        placeholder="Cola aqui…"
        className="w-full rounded-lg border border-gray-700 bg-black/40 p-3 font-mono text-xs text-gray-200 outline-none focus:border-[#D2A63C]"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={enviar}
          disabled={estado === 'a-enviar' || texto.trim().length < 20}
          className="rounded-lg bg-[#D2A63C] px-4 py-2 text-sm font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          {estado === 'a-enviar' ? 'a importar…' : 'Importar'}
        </button>
        {resposta && (
          <p className={`text-sm ${falhou ? 'text-red-400' : 'text-green-400'}`}>{resposta}</p>
        )}
      </div>

      <p className="text-xs leading-relaxed text-gray-600">
        Reimportar é seguro: os saldos e volumes são actualizados, mas o estado da migração e as
        notas que a equipa escreveu ficam como estão. A corretora sabe os números; quem sabe que a
        pessoa já disse que sim é quem falou com ela.
      </p>
    </section>
  )
}
