import PaginaPainel from '../_painel/pagina'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'A minha área · MTM Funded' }

/** A área do cliente MTM Funded: contas, contratos, levantamentos, terminal e certificados. */
export default function DashboardClientePage() {
  return <PaginaPainel variante="cliente" />
}
