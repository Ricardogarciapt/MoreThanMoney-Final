import { PaginaAuditoria, metadadosAuditoria } from '../pagina'

/** Auditoria pública em inglês — /mtmfunded/auditoria/<token>/en. Corpo e notas em ../pagina.tsx. */
export const revalidate = 300
export const metadata = metadadosAuditoria('en')

export default async function AuditoriaPageEn({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <PaginaAuditoria token={token} lingua="en" />
}
