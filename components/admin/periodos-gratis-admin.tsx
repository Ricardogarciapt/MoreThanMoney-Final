'use client'

/**
 * Trial de 3 dias (sem cartão) e campanha 90 dias — quem está, até quando, e o que fazer.
 *
 * O MESMO componente serve o /admin?tab=users, a Gestão do backoffice e o MLM (aí com o
 * patrocinador em destaque). Prorrogar e cancelar actuam no Stripe pela API
 * /api/admin/periodos-gratis; o webhook mantém o espelho.
 */
import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type Linha = {
  stripe_subscription_id: string
  user_id: string | null
  origem: 'trial_3d' | 'campanha_90d'
  inicio: string | null
  fim: string | null
  estado: 'a_decorrer' | 'convertido' | 'terminado_sem_pagamento' | 'cancelado'
  tem_metodo_pagamento: boolean
  nome: string | null
  email: string | null
  patrocinador: string | null
  plano: string | null
  dias_restantes: number | null
}

const ORIGEM: Record<Linha['origem'], string> = { trial_3d: 'Trial 3 dias', campanha_90d: 'Campanha 90 dias' }
const ESTADO: Record<Linha['estado'], { txt: string; cls: string }> = {
  a_decorrer: { txt: 'A decorrer', cls: 'bg-[#D2A63C]/15 text-[#E9C46A]' },
  convertido: { txt: 'Pagou · Premium', cls: 'bg-green-600/20 text-green-300' },
  terminado_sem_pagamento: { txt: 'Bloqueado · sem pagamento', cls: 'bg-red-600/20 text-red-300' },
  cancelado: { txt: 'Cancelado', cls: 'bg-gray-700 text-gray-300' },
}

const data = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-PT') : '—')

export default function PeriodosGratisAdmin({ titulo = 'Trial 3 dias e campanha 90 dias', mlm = false }: { titulo?: string; mlm?: boolean }) {
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [aviso, setAviso] = useState('')
  const [filtro, setFiltro] = useState<'a_decorrer' | 'terminado_sem_pagamento' | 'convertido' | ''>('a_decorrer')
  const [origem, setOrigem] = useState<'' | Linha['origem']>('')
  const [carregar, setCarregar] = useState(true)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState('')

  const ler = useCallback(async () => {
    setCarregar(true)
    setErro('')
    const q = new URLSearchParams()
    if (filtro) q.set('estado', filtro)
    if (origem) q.set('origem', origem)
    const res = await fetch(`/api/admin/periodos-gratis?${q}`).catch(() => null)
    const j = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok) setErro(j.error || 'Não foi possível ler os períodos grátis.')
    setLinhas(j.linhas ?? [])
    setAviso(j.aviso ?? '')
    setCarregar(false)
  }, [filtro, origem])

  useEffect(() => { ler() }, [ler])

  const agir = async (l: Linha, acao: 'prorrogar' | 'cancelar') => {
    let dias: number | undefined
    if (acao === 'prorrogar') {
      const r = window.prompt(`Prorrogar ${ORIGEM[l.origem]} de ${l.nome || l.email || 'cliente'} por quantos dias?`, '3')
      if (!r) return
      dias = Number(r)
    } else if (!window.confirm(`Cancelar já o período grátis de ${l.nome || l.email || 'cliente'}? O acesso fecha e a pessoa vê a página de ativação.`)) {
      return
    }
    setOcupado(l.stripe_subscription_id)
    const res = await fetch('/api/admin/periodos-gratis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptionId: l.stripe_subscription_id, acao, dias }),
    }).catch(() => null)
    const j = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok) setErro(j.error || 'A acção falhou.')
    setOcupado(null)
    ler()
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="mr-auto font-semibold text-white">{titulo}</h3>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)} className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-gray-200">
          <option value="a_decorrer">A decorrer</option>
          <option value="terminado_sem_pagamento">Bloqueados sem pagamento</option>
          <option value="convertido">Convertidos</option>
          <option value="">Todos</option>
        </select>
        <select value={origem} onChange={(e) => setOrigem(e.target.value as typeof origem)} className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-gray-200">
          <option value="">Trial e campanha</option>
          <option value="trial_3d">Só trial 3 dias</option>
          <option value="campanha_90d">Só campanha 90 dias</option>
        </select>
        <Button size="sm" variant="outline" onClick={ler} disabled={carregar} className="border-gray-700">
          {carregar ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>
      {aviso && <p className="mb-2 text-xs text-amber-300">{aviso}</p>}
      {erro && <p className="mb-2 text-xs text-red-400">{erro}</p>}
      {!carregar && linhas.length === 0 ? (
        <p className="text-sm text-gray-500">Ninguém neste filtro.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500">
              <tr>
                <th className="px-2 py-1.5">Cliente</th>
                {mlm && <th className="px-2 py-1.5">Patrocinador</th>}
                <th className="px-2 py-1.5">Tipo</th>
                <th className="px-2 py-1.5">Fim</th>
                <th className="px-2 py-1.5">Estado</th>
                <th className="px-2 py-1.5">Cartão</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {linhas.map((l) => (
                <tr key={l.stripe_subscription_id}>
                  <td className="px-2 py-2">
                    <p className="text-white">{l.nome || '—'}</p>
                    <p className="text-xs text-gray-500">{l.email}{!mlm && l.patrocinador ? ` · patroc. @${l.patrocinador}` : ''}</p>
                  </td>
                  {mlm && <td className="px-2 py-2 text-gray-300">{l.patrocinador ? `@${l.patrocinador}` : '—'}</td>}
                  <td className="px-2 py-2 text-gray-300">{ORIGEM[l.origem]}</td>
                  <td className="px-2 py-2 text-gray-300">
                    {data(l.fim)}
                    {l.dias_restantes !== null && <span className="ml-1 text-xs text-gray-500">({l.dias_restantes} d)</span>}
                  </td>
                  <td className="px-2 py-2"><Badge className={`text-[10px] ${ESTADO[l.estado].cls}`}>{ESTADO[l.estado].txt}</Badge></td>
                  <td className="px-2 py-2 text-xs text-gray-400">{l.tem_metodo_pagamento ? 'Sim' : 'Não'}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    {l.estado === 'a_decorrer' && (
                      <>
                        <Button size="sm" variant="outline" className="mr-1 h-7 border-gray-700 text-xs" disabled={ocupado === l.stripe_subscription_id} onClick={() => agir(l, 'prorrogar')}>Prorrogar</Button>
                        <Button size="sm" variant="outline" className="h-7 border-red-900 text-xs text-red-300" disabled={ocupado === l.stripe_subscription_id} onClick={() => agir(l, 'cancelar')}>Cancelar</Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
