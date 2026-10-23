import { redirect } from 'next/navigation'
import PaginaPainel, { CAMINHO_PAINEL } from '../../_painel/pagina'
import { SECCOES_DO_CLIENTE, SECCOES_DO_TORNEIO } from '../../_painel/seccoes'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Torneio · MTM Funded' }

/**
 * O painel do TORNEIO: a prova, a inscrição, a classificação e os certificados.
 *
 * Até 23/10/2026 esta morada era também a área de cliente, e há emails já enviados com
 * `?conta=…&credenciais=1` ou `?tab=contratos` a apontar para aqui. Esses links seguem para a área
 * de cliente (/mtmfunded/dashboard) com a mesma query — nenhum link antigo morre.
 */
const soDoCliente = (tab: string) =>
  (SECCOES_DO_CLIENTE as readonly string[]).includes(tab) && !(SECCOES_DO_TORNEIO as readonly string[]).includes(tab)

export default async function DashboardTorneioPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams
  const tab = typeof q.tab === 'string' ? q.tab : ''
  if (q.credenciais || q.conta || q.programa || soDoCliente(tab)) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(q)) if (typeof v === 'string') qs.set(k, v)
    redirect(`${CAMINHO_PAINEL.cliente}?${qs.toString()}`)
  }
  return <PaginaPainel variante="torneio" />
}
