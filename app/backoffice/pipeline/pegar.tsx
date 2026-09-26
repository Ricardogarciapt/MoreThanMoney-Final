'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * PEGAR NUM LEAD DA BOLSA.
 *
 * A bolsa existe porque havia 97 negócios e zero com vendedor: os leads existiam e eram invisíveis
 * a toda a gente menos ao dono, e ninguém se podia atribuir a um lead que não via. Este botão é o
 * outro lado dessa decisão — quem quer trabalhar, pega.
 *
 * O papel NÃO se escolhe aqui. É o momento do lead que o decide (um lead cru pede um prospector,
 * uma reunião marcada pede um closer), e o servidor recusa quem não tenha esse papel, dizendo
 * qual falta. Deixar escolher aqui fazia alguém inscrever-se na coluna errada — e a coluna é o
 * que manda nas comissões.
 *
 * Duas pessoas a carregar ao mesmo tempo: uma ganha e a outra recebe «outra pessoa pegou primeiro»
 * em vez de um sucesso que não aconteceu. Quem perde vê a lista actualizada e segue para o
 * seguinte.
 */
export function Pegar({ id, nome }: { id: string; nome: string }) {
  const [estado, setEstado] = useState<'parado' | 'a-pegar'>('parado')
  const [erro, setErro] = useState<string | null>(null)
  const router = useRouter()

  async function pegar() {
    setEstado('a-pegar')
    setErro(null)
    try {
      const r = await fetch(`/api/backoffice/negocios/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accao: 'pegar' }),
      })
      const d = (await r.json()) as { error?: string; papel?: string }
      if (!r.ok) setErro(d.error ?? 'Não deu para pegar neste lead.')
      else router.refresh()
    } catch {
      setErro('Não consegui falar com o servidor.')
    }
    setEstado('parado')
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={pegar}
        disabled={estado === 'a-pegar'}
        title={`Ficas responsável por ${nome}`}
        className="rounded-lg border border-[#D2A63C] px-3 py-1.5 text-xs font-semibold text-[#D2A63C] transition hover:bg-[#D2A63C] hover:text-black disabled:opacity-40"
      >
        {estado === 'a-pegar' ? 'a pegar…' : 'Pego neste'}
      </button>
      {erro && <p className="max-w-xs text-xs leading-snug text-red-400">{erro}</p>}
    </div>
  )
}
