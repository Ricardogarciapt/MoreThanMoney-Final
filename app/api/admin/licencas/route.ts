import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAccess, getSupabaseAdmin } from '@/lib/admin-api-helpers'
import {
  emitirLicenca,
  libertarAtivacoes,
  normalizarLogin,
  reativarLicenca,
  revogarLicenca,
  daquiAUmAno,
  type PlanoLicenca,
} from '@/lib/licencas'

export const dynamic = 'force-dynamic'

async function exigirAdmin() {
  const { isAdmin, error } = await verifyAdminAccess()
  if (!isAdmin) return NextResponse.json({ error: error || 'Sem permissões' }, { status: 403 })
  return null
}

/** Lista as licenças com as contas onde estão a correr, para o painel. */
export async function GET(req: NextRequest) {
  const negado = await exigirAdmin()
  if (negado) return negado

  const db = getSupabaseAdmin()
  const procura = (req.nextUrl.searchParams.get('q') || '').trim()
  const estado = req.nextUrl.searchParams.get('estado') || ''

  let consulta = db.from('licencas').select('*').order('criada_em', { ascending: false }).limit(500)
  if (estado) consulta = consulta.eq('estado', estado)
  if (procura) {
    const p = `%${procura}%`
    consulta = consulta.or(`chave.ilike.${p},email.ilike.${p},mt5_login.ilike.${p}`)
  }

  const { data: licencas, error } = await consulta
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (licencas ?? []).map((l) => l.id)
  const { data: ativacoes } = ids.length
    ? await db.from('licenca_ativacoes').select('*').in('licenca_id', ids)
    : { data: [] }

  // Nomes dos donos numa leitura só — a alternativa era um pedido por linha da tabela.
  const userIds = [...new Set((licencas ?? []).map((l) => l.user_id).filter(Boolean))] as string[]
  const { data: perfis } = userIds.length
    ? await db.from('profiles').select('id, email, full_name').in('id', userIds)
    : { data: [] }
  const porId = new Map((perfis ?? []).map((p) => [p.id, p]))

  return NextResponse.json({
    licencas: (licencas ?? []).map((l) => ({
      ...l,
      dono: l.user_id ? (porId.get(l.user_id) ?? null) : null,
      ativacoes: (ativacoes ?? []).filter((a) => a.licenca_id === l.id),
    })),
  })
}

/** Emitir uma licença à mão (oferta, suporte, cliente que pagou por fora). */
export async function POST(req: NextRequest) {
  const negado = await exigirAdmin()
  if (negado) return negado

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const plano = String(b.plano ?? 'anual') as PlanoLicenca
  if (!['anual', 'vitalicia', 'incluida'].includes(plano)) {
    return NextResponse.json({ error: 'Plano inválido' }, { status: 400 })
  }

  const email = String(b.email ?? '').trim().toLowerCase()
  let userId = (b.userId ? String(b.userId) : null) as string | null

  // Emitir por email é o caso comum no suporte. Se esse email já for de um membro, a licença
  // aparece-lhe na área de membro em vez de ficar solta.
  if (!userId && email) {
    const db = getSupabaseAdmin()
    const { data } = await db.from('profiles').select('id').eq('email', email).maybeSingle()
    userId = data?.id ?? null
  }

  const licenca = await emitirLicenca({
    userId,
    email: email || null,
    plano,
    origem: 'admin',
    mt5Login: normalizarLogin(b.mt5Login),
    contasPermitidas: Number(b.contasPermitidas ?? 1) || 1,
    expiraEm: plano === 'anual' ? daquiAUmAno() : null,
    notas: b.notas ? String(b.notas) : 'Emitida no painel de admin',
  })

  return NextResponse.json({ licenca })
}

/** Revogar, reactivar ou libertar as contas de uma licença. */
export async function PATCH(req: NextRequest) {
  const negado = await exigirAdmin()
  if (negado) return negado

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const id = String(b.id ?? '')
  const acao = String(b.acao ?? '')
  if (!id) return NextResponse.json({ error: 'Falta o id' }, { status: 400 })

  if (acao === 'revogar') await revogarLicenca(id, b.notas ? String(b.notas) : undefined)
  else if (acao === 'reativar') await reativarLicenca(id)
  else if (acao === 'libertar') await libertarAtivacoes(id)
  else return NextResponse.json({ error: 'Acção desconhecida' }, { status: 400 })

  const db = getSupabaseAdmin()
  const { data } = await db.from('licencas').select('*').eq('id', id).maybeSingle()
  return NextResponse.json({ licenca: data })
}
