import { NextResponse } from 'next/server'
import { exigirGestao } from '@/lib/backoffice-sessao'

/**
 * Quem abre o Centro Social (/admin/social e backoffice → Gestão → Centro Social).
 *
 * O back-office decide: o admin passa sempre (tem todas as capacidades); a equipa precisa do acesso
 * «Social & conteúdo» (`bo.gestao_social`), dado em Gestão → Acessos. Lê sessão por cookie OU pelo
 * Bearer da Supabase, por isso serve as rotas antigas que mandavam o token no cabeçalho.
 *
 * Devolve a resposta de recusa, ou `null` quando pode seguir — o mesmo feitio do `requireAdmin`.
 */
export async function exigirSocial(request?: Request): Promise<NextResponse | null> {
  const g = await exigirGestao(request, 'bo.gestao_social')
  return g.negado
}

/** As Ligações (tokens de Página, segredo da app, webhook da Meta) são só do dono. */
export async function exigirDonoSocial(request?: Request): Promise<NextResponse | null> {
  const g = await exigirGestao(request, 'bo.dono')
  return g.negado
}

/** Leads sociais: servem o CRM («Clientes & CRM») e o Centro Social — basta uma das duas. */
export async function exigirLeadsSociais(request?: Request): Promise<NextResponse | null> {
  const crm = await exigirGestao(request, 'bo.gestao_crm')
  if (!crm.negado) return null
  return (await exigirGestao(request, 'bo.gestao_social')).negado
}
