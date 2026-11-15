/**
 * Quem está a pedir e o que pode usar.
 *
 * A página vive atrás do guarda de membros (middleware); as rotas voltam a confirmar a sessão
 * porque também são chamadas de dentro da app-mobile e das nativas, onde o cookie não chega
 * (ver `lib/sessao-do-pedido`). As marcas da casa (Ricardo Garcia, More Than Money) e o render
 * sem limite são só para admins.
 *
 * 10/11 (Ricardo): o Estúdio é só dele — todas as rotas do Conteúdo Magnético recusam (403)
 * quem não é admin.
 */
import { quemNoEstudio } from '@/lib/estudio/acesso'

// 10/11 23:43 (Ricardo): o dono pode dar acesso ao estúdio a outras pessoas no backoffice.
// `admin` aqui quer dizer «da casa»: admin OU alguém com acesso ao estúdio (estudio_acessos).
// `criar` diz se pode gerar guiões e vídeos (o separador «Criar»).
export type Quem = { userId: string; admin: boolean; criar: boolean }

export async function quemPede(request: Request): Promise<Quem | null> {
  const q = await quemNoEstudio(request)
  if (!q) return null
  return { userId: q.userId, admin: q.areas.size > 0, criar: q.areas.has('criar') }
}

/** As marcas da casa: a biblioteca partilhada da equipa filtra por elas (não por quem criou). */
export const MARCAS_CASA = ['ricardo-garcia', 'morethanmoney']

/** Renders de vídeo por dia para quem não é admin (o motor é uma máquina nossa, partilhada). */
export const RENDERS_POR_DIA_MEMBRO = 2

/** O segredo do motor de render (o mesmo CRON_SECRET dos crons). */
// Os motores fora da Vercel entram com o CRON_SECRET ou, como o cortador e o editor do Mac,
// com o segredo dos workers (x-caption-secret = LMS_CAPTION_WORKER_SECRET).
export function ehMotor(request: Request): boolean {
  const s = process.env.CRON_SECRET?.trim()
  if (s && request.headers.get('authorization') === `Bearer ${s}`) return true
  const w = process.env.LMS_CAPTION_WORKER_SECRET?.trim()
  return !!w && request.headers.get('x-caption-secret') === w
}
