/**
 * A casca da área do dono. A fechadura é AQUI, no servidor: sem `bo.dono` a página não existe
 * (404, e não «sem acesso» — não se anuncia o que está do outro lado da porta). Cada ecrã por
 * baixo continua com a sua própria verificação de admin e cada API com o seu `requireAdmin`.
 */
import { notFound } from 'next/navigation'
import { contextoBackoffice } from '@/lib/backoffice-sessao'
import { pode } from '@/lib/backoffice-papeis'
import NavDono from './nav'

export const dynamic = 'force-dynamic'

export default async function DonoLayout({ children }: { children: React.ReactNode }) {
  const ctx = await contextoBackoffice()
  if (!ctx || !pode(ctx.capacidades, 'bo.entrar') || !pode(ctx.capacidades, 'bo.dono')) notFound()
  return (
    <div data-largo className="space-y-4">
      <NavDono />
      {children}
    </div>
  )
}
