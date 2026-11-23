/**
 * Recrutamento no Threads, para correr à mão (Bearer CRON_SECRET ou sessão de admin no browser). O ciclo normal corre dentro do
 * cron do executor do pipeline (sem cron próprio: o projeto está no tecto de 100 crons da Vercel).
 */
import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { verifyAdminAccess } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { correrRecrutamentoThreads } from '@/lib/threads/ciclo'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req) && !(await verifyAdminAccess()).isAdmin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await correrRecrutamentoThreads(getSupabaseAdmin()))
}
