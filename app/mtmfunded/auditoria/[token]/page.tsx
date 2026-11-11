import { PaginaAuditoria, metadadosAuditoria } from './pagina'

/** Auditoria pública em português — /mtmfunded/auditoria/<token>. Corpo e notas em ./pagina.tsx. */
export const revalidate = 300
export const metadata = metadadosAuditoria('pt')

export default async function AuditoriaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <PaginaAuditoria token={token} lingua="pt" />
}
