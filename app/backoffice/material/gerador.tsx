'use client'

/**
 * O gerador de materiais, do lado de quem o usa.
 *
 * Duas decisões de interface que são decisões de honestidade:
 *
 * 1. Quando a revisão recusa o texto, ele NÃO aparece. Mostrar-lhe o texto recusado «para ela
 *    decidir» tornava a revisão um aviso — e um aviso resolve-se com um copiar-colar. O que
 *    aparece é a lista do que estava errado, que é o que ensina a pedir melhor da próxima.
 * 2. O botão de copiar copia, e diz que copiou. Sem isso a pessoa carrega três vezes e não sabe
 *    se alguma funcionou.
 *
 * Quem decide o que sai daqui é o servidor. Este ficheiro não conhece preços, não conhece prova e
 * não tem uma única regra de marca — se as tivesse, seriam regras que qualquer pessoa lê no
 * JavaScript da página e contorna com um pedido à mão.
 */
import { useState } from 'react'

type Tipo = { chave: string; nome: string; descricao: string }

export function Gerador({ tipos }: { tipos: Tipo[] }) {
  const [tipo, setTipo] = useState(tipos[0]?.chave ?? '')
  const [tema, setTema] = useState('')
  const [aGerar, setAGerar] = useState(false)
  const [texto, setTexto] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [problemas, setProblemas] = useState<string[]>([])
  const [copiado, setCopiado] = useState(false)

  const escolhido = tipos.find((t) => t.chave === tipo)

  async function gerar() {
    setAGerar(true)
    setErro(null)
    setProblemas([])
    setTexto(null)
    setCopiado(false)
    try {
      const r = await fetch('/api/backoffice/material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, tema }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        setErro(d?.error || 'Não consegui gerar.')
        setProblemas(Array.isArray(d?.problemas) ? d.problemas : [])
        return
      }
      setTexto(String(d?.texto ?? ''))
    } catch {
      setErro('Sem ligação. Tenta outra vez.')
    } finally {
      setAGerar(false)
    }
  }

  async function copiar() {
    if (!texto) return
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setErro('O browser não me deixou copiar. Selecciona o texto e copia à mão.')
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-gray-800 bg-gray-900/40 p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500">Tipo de peça</span>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 focus:border-[#D2A63C] focus:outline-none"
          >
            {tipos.map((t) => (
              <option key={t.chave} value={t.chave}>
                {t.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-gray-500">Sobre o quê</span>
          <input
            value={tema}
            onChange={(e) => setTema(e.target.value)}
            maxLength={300}
            placeholder={
              tipo === 'argumentario' ? 'a objecção: «é caro»' : 'ex.: quem já perdeu dinheiro a operar sozinho'
            }
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-[#D2A63C] focus:outline-none"
          />
        </label>
      </div>

      {escolhido && <p className="text-xs leading-relaxed text-gray-500">{escolhido.descricao}</p>}

      <button
        type="button"
        onClick={gerar}
        disabled={aGerar || tema.trim().length < 3}
        className="rounded-lg bg-[#D2A63C] px-4 py-2 text-sm font-semibold text-gray-950 transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {aGerar ? 'a escrever…' : 'Gerar material'}
      </button>

      {erro && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-200">
          <p className="font-medium">{erro}</p>
          {problemas.length > 0 && (
            <>
              <p className="mt-2 text-xs text-red-300/80">O que estava errado:</p>
              <ul className="mt-1 space-y-0.5 text-xs text-red-300/70">
                {problemas.map((p) => (
                  <li key={p}>· {p}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {texto && (
        <div className="space-y-2">
          <div className="whitespace-pre-wrap rounded-lg border border-gray-700 bg-gray-950 p-4 text-sm leading-relaxed text-gray-100">
            {texto}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={copiar}
              className="rounded-lg border border-[#D2A63C]/50 px-3 py-1.5 text-xs font-medium text-[#D2A63C] transition-colors hover:bg-[#D2A63C]/10"
            >
              {copiado ? 'copiado ✓' : 'Copiar'}
            </button>
            <span className="text-xs text-gray-500">
              Lê antes de publicar. Isto é um rascunho com o tom da casa — quem assina és tu.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
