/**
 * A casca da Gestão. A fechadura é AQUI, no servidor: sem acesso a nenhum módulo a página não existe
 * (404, e não «sem acesso» — não se anuncia o que está do outro lado da porta). Cada módulo volta a
 * perguntar pela SUA capacidade na página, e cada API pela mesma (`exigirGestao`).
 */
import { notFound } from 'next/navigation'
import { contextoBackoffice } from '@/lib/backoffice-sessao'
import { entraNaGestao, pode } from '@/lib/backoffice-papeis'

export const dynamic = 'force-dynamic'

export default async function GestaoLayout({ children }: { children: React.ReactNode }) {
  const ctx = await contextoBackoffice()
  if (!ctx || !pode(ctx.capacidades, 'bo.entrar') || !entraNaGestao(ctx.capacidades)) notFound()
  return <div data-largo>{children}</div>
}
