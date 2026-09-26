'use client'

/**
 * O HISTÓRICO de um negócio, no cartão dele.
 *
 * SÓ SE LÊ QUANDO SE PEDE. A alternativa era o servidor trazer os eventos dos cinquenta negócios da
 * página: cinquenta leituras para mostrar o que, na prática, se abre num negócio ou dois. O
 * pipeline é a página que se abre de manhã e a conta paga-se em cada visita — enquanto os eventos
 * ficam por trás de um clique, quem não pergunta não paga.
 *
 * QUEM PODE VER DECIDE-SE NO SERVIDOR, na rota, com a mesma ordem do PATCH (capacidade, âmbito, ler
 * o negócio, comparar). Este componente manda o id do negócio e mais nada — se ela não participa, a
 * resposta é 404 e o painel diz isso em vez de abrir vazio.
 *
 * E UM ERRO NÃO SE MOSTRA COMO LISTA VAZIA. «Este negócio ainda não tem movimentos» e «não consegui
 * ler o histórico» são duas frases porque são duas situações: a primeira é um facto sobre o negócio,
 * a segunda é uma avaria nossa. Mostrar as duas como um painel em branco é o defeito que já custou
 * caro nos Alertas de Trading.
 */
import { useState } from 'react'
import { ESTADO_PIPELINE_NOME, ehEstadoPipeline } from '@/lib/backoffice-vista'

interface Evento {
  id: number
  de: string | null
  para: string | null
  nota: string | null
  em: string
  quem: string | null
}

/** O nome do estado como se lê no ecrã; um estado fora do catálogo mostra-se como está. */
function estado(v: string | null): string {
  if (!v) return '—'
  return ehEstadoPipeline(v) ? ESTADO_PIPELINE_NOME[v] : v
}

/** Dia e hora: num histórico, «ontem às 18h» e «ontem às 9h» são duas versões da história. */
function quando(v: string): string {
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return d.toLocaleString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function Historico({ id }: { id: string }) {
  const [aberto, setAberto] = useState(false)
  const [eventos, setEventos] = useState<Evento[] | null>(null)
  const [haMais, setHaMais] = useState(false)
  const [aLer, setALer] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function abrir() {
    setAberto(true)
    // Já lido nesta visita não se volta a ler. Um histórico é o passado: ele não muda enquanto a
    // pessoa olha para ele, e quando ela mover o negócio a página recarrega de qualquer maneira.
    if (eventos !== null || aLer) return
    setALer(true)
    setErro(null)
    try {
      const r = await fetch(`/api/backoffice/negocios/${id}`)
      const d = await r.json().catch(() => ({}))
      if (!r.ok) {
        setErro(d?.detalhe || d?.error || 'Não consegui ler o histórico.')
        return
      }
      setEventos(Array.isArray(d?.eventos) ? d.eventos : [])
      setHaMais(!!d?.ha_mais)
    } catch {
      setErro('Sem ligação. Tenta outra vez.')
    } finally {
      setALer(false)
    }
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => void abrir()}
        className="mt-2 text-xs text-gray-500 underline transition-colors hover:text-[#D2A63C]"
      >
        Histórico
      </button>
    )
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-gray-800 bg-black/20 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Histórico</span>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="text-xs text-gray-500 underline hover:text-gray-300"
        >
          fechar
        </button>
      </div>

      {aLer && <p className="text-xs text-gray-500">a ler…</p>}

      {erro && <p className="text-xs text-red-400">{erro}</p>}

      {!aLer && !erro && eventos !== null && eventos.length === 0 && (
        <p className="text-xs leading-relaxed text-gray-500">
          Este negócio ainda não tem movimentos gravados. O primeiro aparece aqui quando alguém o
          mover ou ocupar um papel nele.
        </p>
      )}

      {eventos !== null && eventos.length > 0 && (
        <ol className="space-y-1.5">
          {eventos.map((e) => (
            <li key={e.id} className="text-xs leading-relaxed text-gray-400">
              <span className="text-gray-500">{quando(e.em)}</span>
              {' · '}
              {/* Um evento sem `de` é o nascimento do negócio — não veio de estado nenhum. */}
              <span className="text-gray-300">
                {e.de ? `${estado(e.de)} → ${estado(e.para)}` : estado(e.para)}
              </span>
              {e.quem && <span className="text-gray-500"> por {e.quem}</span>}
              {e.nota && <span className="text-gray-500"> — {e.nota}</span>}
            </li>
          ))}
        </ol>
      )}

      {haMais && (
        <p className="text-xs text-gray-600">
          Só os 100 movimentos mais recentes. Se precisares do resto, fala com o Ricardo.
        </p>
      )}
    </div>
  )
}
