import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { contasDoUtilizador, autorizarMtmAuto } from '@/lib/mtm-auto-bridge'
import { PRESETS } from '@/lib/risk-presets'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const supabase = getSupabaseAdmin()

/**
 * O estado do MTM Auto desta pessoa, para a app-mobile.
 *
 * Lê as tabelas do MTM Auto — não uma cópia delas. Quem configurar o risco aqui vê o mesmo
 * número na app MTM Auto um segundo depois, porque é o mesmo número.
 */
export async function GET(request: NextRequest) {
  const { erro, userId } = await autorizarMtmAuto(request)
  if (erro) return erro

  const [contas, { data: subs }, { data: provs }] = await Promise.all([
    contasDoUtilizador(userId!),
    supabase.from('mtmauto_subscriptions').select('provider_id, ativo, auto_aceitar').eq('user_id', userId!).eq('ativo', true),
    // `apagado_em` (084) tem de entrar: sem ele, uma estratégia escondida no admin do site
    // continuava a aparecer na app-mobile. É o mesmo filtro de /mtmauto e da criação de contas.
    supabase.from('mtmauto_providers').select('id, slug, nome, descricao, ativo').eq('ativo', true).is('apagado_em', null).order('nome'),
  ])

  const seguidas = new Map((subs ?? []).map((s) => [s.provider_id as string, Boolean(s.auto_aceitar)]))

  return NextResponse.json({
    ok: true,
    contas,
    // Os mesmos perfis de risco do MTM Auto — escolher um escreve os valores todos de uma vez.
    presets: PRESETS.map((p) => ({
      id: p.id,
      nome: p.nome,
      descricao: p.descricao,
      riscoPct: p.riscoPct,
      riscoMaxPct: p.riscoMaxPct,
      saidasPct: p.saidasPct,
    })),
    estrategias: (provs ?? []).map((p) => ({
      id: p.id,
      slug: p.slug,
      nome: p.nome,
      descricao: p.descricao,
      segue: seguidas.has(p.id as string),
      // Mostra-se o modo, mas mudá-lo é na app MTM Auto: é lá que se assume a cópia automática.
      automatico: seguidas.get(p.id as string) === true,
    })),
  })
}
