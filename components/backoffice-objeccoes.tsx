'use client'

/**
 * «ELE DISSE QUE É CARO» — o que está por trás e o que fazer.
 *
 * ═══ PORQUE É QUE ISTO NÃO É UM GUIÃO ══════════════════════════════════════════════════════
 *
 * Um guião de respostas prontas produz vendedores a debitar frases, e quem está do outro lado
 * percebe à terceira palavra. O que falta a quem está ao telefone não é a frase — é perceber **o
 * que a pessoa está mesmo a dizer**. «É caro» quase nunca é sobre o preço: é sobre não ver o que
 * recebe por ele. Quem perceber isso improvisa melhor do que qualquer guião.
 *
 * Por isso cada objeção mostra duas coisas e não uma: o que está por trás, e o que FAZER — não o
 * que recitar.
 *
 * A lista e o reconhecimento vivem em `lib/vendas/abordagem.ts`, que é puro e tem guarda. Aqui só
 * se desenha. E a guarda tem um teste que falha se alguma resposta prometer ganhos: nenhuma destas
 * frases pode sugerir inventar um número, porque do outro lado está dinheiro de outra pessoa.
 *
 * ═══ GUARDAR É OPCIONAL, E ESCREVE NA NOTA ═════════════════════════════════════════════════
 *
 * Quando se guarda, vai para a NOTA do negócio pela mesma rota que a nota usa. Não há aqui segunda
 * porta de escrita: duas portas acabam a discordar sobre o que ficou gravado, e a que ninguém revê
 * é a que mente.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { OBJECCOES, objeccaoDe, type Objeccao } from '@/lib/vendas/abordagem'

export function Objeccoes({ id, nota }: { id: string; nota: string | null }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [escolhida, setEscolhida] = useState<Objeccao | null>(null)
  const [aGuardar, setAGuardar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [, arrancar] = useTransition()

  // Reconhece enquanto se escreve. Quem está ao telefone não tem mãos para carregar em «procurar».
  const detectada = escolhida ?? objeccaoDe(texto)

  async function guardar() {
    if (!detectada) return
    setAGuardar(true)
    setErro(null)
    const linha = `Objeção: ${detectada.chave}${texto.trim() ? ` — «${texto.trim()}»` : ''}`
    // Acrescenta-se à nota em vez de a substituir: a nota é o que se sabe da pessoa, e apagar o que
    // lá estava para escrever isto perdia tudo o resto.
    const nova = [nota?.trim(), linha].filter(Boolean).join('\n')
    try {
      const r = await fetch(`/api/backoffice/negocios/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nota: nova }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        setErro(d?.detalhe || d?.error || 'Não consegui guardar.')
        return
      }
      setTexto('')
      setEscolhida(null)
      setAberto(false)
      arrancar(() => router.refresh())
    } catch {
      setErro('Sem ligação. Tenta outra vez.')
    } finally {
      setAGuardar(false)
    }
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="text-xs text-gray-400 underline-offset-2 hover:text-[#D2A63C] hover:underline"
      >
        O que é que ele disse?
      </button>
    )
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-gray-800 bg-black/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Escreve o que ele disse
        </span>
        <button
          type="button"
          onClick={() => { setAberto(false); setEscolhida(null); setTexto('') }}
          className="text-xs text-gray-500 hover:text-gray-300"
        >
          fechar
        </button>
      </div>

      <input
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setEscolhida(null) }}
        placeholder="«vou pensar», «é caro», «já sigo outro»…"
        className="w-full rounded-lg border border-gray-700 bg-gray-950/60 px-2 py-1.5 text-xs text-gray-100 placeholder:text-gray-600 focus:border-[#D2A63C] focus:outline-none"
      />

      {/* Os atalhos existem porque a objeção vem muitas vezes ao telefone e não por escrito: é mais
          rápido carregar do que transcrever o que a pessoa acabou de dizer. */}
      <div className="flex flex-wrap gap-1">
        {OBJECCOES.map((o) => (
          <button
            key={o.chave}
            type="button"
            onClick={() => { setEscolhida(o); setTexto('') }}
            className={`rounded-md border px-1.5 py-0.5 text-[11px] transition-colors ${
              detectada?.chave === o.chave
                ? 'border-[#D2A63C] text-[#D2A63C]'
                : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200'
            }`}
          >
            {o.comoSoa[0]}
          </button>
        ))}
      </div>

      {detectada ? (
        <div className="space-y-2 rounded-lg border border-[#D2A63C]/25 bg-[#D2A63C]/[0.06] p-2.5">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">O que está por trás</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-gray-300">{detectada.porTras}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">O que fazer</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#E9C46A]">{detectada.resposta}</p>
          </div>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={aGuardar}
            className="rounded-md border border-gray-700 px-2 py-1 text-[11.5px] text-gray-300 hover:border-[#D2A63C] hover:text-[#D2A63C] disabled:opacity-50"
          >
            {aGuardar ? 'a guardar…' : 'Guardar na nota'}
          </button>
        </div>
      ) : (
        texto.trim().length > 2 && (
          /**
           * NÃO INVENTAR UMA OBJEÇÃO QUE NÃO SE RECONHECE. Devolver a mais parecida seria dar a
           * resposta errada com ar de certeza — e quem a usasse ao telefone perderia o lead sem
           * perceber porquê.
           */
          <p className="text-[12px] leading-relaxed text-gray-500">
            Não reconheço esta. Escreve na nota o que ele disse — se aparecer várias vezes, vale a
            pena acrescentá-la à lista.
          </p>
        )
      )}

      {erro && <p className="text-[12px] text-red-400">{erro}</p>}
    </div>
  )
}
