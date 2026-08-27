import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Quem vive nos DOIS sistemas — e onde é que isso já está a dar problema.
 *
 * As contas do MTM Auto (`mtmauto_accounts`) e as ligações do MTM Copy (`mtmcopy_connections`)
 * cresceram cada uma para o seu lado, com o mesmo cliente e, por vezes, a MESMA conta de
 * corretora nas duas. Isso não é um detalhe de arrumação: quando o mesmo login MT5 está ligado
 * duas vezes, dois sistemas dimensionam risco na mesma conta sem saber um do outro, e a pessoa
 * leva o dobro do risco que escolheu.
 *
 * Este painel existe para isso ser VISÍVEL antes de custar dinheiro.
 */
export async function GET(req: NextRequest) {
  const negado = await requireAdmin(req)
  if (negado) return negado
  const db = getSupabaseAdmin()

  const [{ data: contasAuto }, { data: ligacoes }] = await Promise.all([
    db.from('mtmauto_accounts').select('id, user_id, login, servidor, rotulo, estado, copia_ativa, demo'),
    db
      .from('mtmcopy_connections')
      .select('id, user_id, mt5_login, account_label, copy_method, is_active, metaapi_account_id, purpose'),
  ])

  const userIds = [
    ...new Set([
      ...(contasAuto ?? []).map((c) => c.user_id as string),
      ...(ligacoes ?? []).map((c) => c.user_id as string),
    ].filter(Boolean)),
  ]

  const { data: perfis } = userIds.length
    ? await db
        .from('profiles')
        .select('id, email, full_name, user_type, member_category, subscription_plan, is_active')
        .in('id', userIds)
    : { data: [] as never[] }
  const perfilDe = new Map((perfis ?? []).map((p) => [p.id as string, p]))

  const pessoas = userIds.map((uid) => {
    const auto = (contasAuto ?? []).filter((c) => c.user_id === uid)
    const copy = (ligacoes ?? []).filter((c) => c.user_id === uid)
    const p = perfilDe.get(uid)

    // O que interessa mesmo: o MESMO login MT5 nos dois lados.
    const loginsAuto = new Set(auto.map((c) => String(c.login ?? '').replace(/\D/g, '')).filter(Boolean))
    const repetidos = copy
      .map((c) => String(c.mt5_login ?? '').replace(/\D/g, ''))
      .filter((l) => l && loginsAuto.has(l))

    return {
      userId: uid,
      email: (p?.email as string) ?? null,
      nome: (p?.full_name as string) ?? null,
      nivel:
        p?.user_type === 'admin'
          ? 'admin'
          : p?.member_category === 'vip'
            ? 'vip'
            : p?.subscription_plan === 'premium' || p?.member_category === 'premium'
              ? 'premium'
              : 'membro',
      auto: auto.map((c) => ({
        login: c.login,
        rotulo: c.rotulo,
        estado: c.estado,
        copiaAtiva: Boolean(c.copia_ativa),
        demo: Boolean(c.demo),
      })),
      copy: copy.map((c) => ({
        login: c.mt5_login,
        rotulo: c.account_label,
        metodo: c.copy_method,
        ativo: Boolean(c.is_active),
        proposito: c.purpose,
      })),
      repetidos: [...new Set(repetidos)],
    }
  })

  // Quem tem conta nos dois primeiro, e dentro desses quem tem login repetido no topo.
  pessoas.sort((a, b) => {
    const dosDois = (x: typeof a) => (x.auto.length && x.copy.length ? 1 : 0)
    return (
      b.repetidos.length - a.repetidos.length ||
      dosDois(b) - dosDois(a) ||
      (a.email ?? '').localeCompare(b.email ?? '')
    )
  })

  return NextResponse.json({
    ok: true,
    pessoas,
    resumo: {
      total: pessoas.length,
      nosDois: pessoas.filter((p) => p.auto.length && p.copy.length).length,
      soAuto: pessoas.filter((p) => p.auto.length && !p.copy.length).length,
      soCopy: pessoas.filter((p) => !p.auto.length && p.copy.length).length,
      comLoginRepetido: pessoas.filter((p) => p.repetidos.length).length,
    },
  })
}
