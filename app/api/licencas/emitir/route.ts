import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/admin-api-helpers'
import { carregarDireitos } from '@/lib/entitlements'
import { emitirLicenca, licencasDoUtilizador, normalizarLogin } from '@/lib/licencas'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

/**
 * Botão "Emitir licença" da área de membro.
 *
 * Uma por membro, para uma conta. Quem tiver Premium/VIP/admin activo não paga — a licença fica
 * com plano 'incluida' e morre com a subscrição, sem precisar de ser revogada à mão.
 *
 * O `userId` vem SEMPRE da sessão, nunca do corpo do pedido.
 */
export async function POST(req: NextRequest) {
  const { userId, email, error } = await getAuthenticatedUser()
  if (!userId) return NextResponse.json({ error: error || 'Não autenticado' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { mt5Login?: unknown }
  const login = normalizarLogin(body.mt5Login)

  if (!login) {
    return NextResponse.json(
      { error: 'Indica o número da conta MT5 (apenas dígitos).' },
      { status: 400 },
    )
  }
  // Logins MT5 andam pelos 5–10 dígitos. Rejeitar aqui evita prender a licença a um número que o
  // cliente escreveu a mais e que só se descobre errado quando o EA recusa arrancar.
  if (login.length < 4 || login.length > 12) {
    return NextResponse.json({ error: 'O número da conta não parece válido.' }, { status: 400 })
  }

  const direitos = await carregarDireitos(userId)
  if (!direitos.admin && !direitos.vip && !direitos.premium) {
    return NextResponse.json(
      { error: 'A licença incluída é para membros Premium, VIP ou Fundador.' },
      { status: 403 },
    )
  }

  const existentes = await licencasDoUtilizador(userId)
  const jaTem = existentes.find((l) => l.plano === 'incluida' && l.estado === 'ativa')
  if (jaTem) {
    return NextResponse.json(
      { error: 'Já tens uma licença incluída activa.', licenca: jaTem },
      { status: 409 },
    )
  }

  // A mesma conta MT5 não pode ficar debaixo de duas licenças: seria a porta para partilhar uma
  // subscrição por várias pessoas com a mesma conta em cima da mesa.
  const db = getSupabaseAdmin()
  const { data: emUso } = await db
    .from('licencas')
    .select('id, user_id')
    .eq('mt5_login', login)
    .eq('estado', 'ativa')
    .maybeSingle()
  if (emUso && emUso.user_id !== userId) {
    return NextResponse.json(
      { error: 'Esta conta MT5 já está ligada a outra licença.' },
      { status: 409 },
    )
  }

  const licenca = await emitirLicenca({
    userId,
    email: email ?? null,
    plano: 'incluida',
    origem: 'membro',
    mt5Login: login,
    contasPermitidas: 1,
    notas: `Emitida na área de membro (${direitos.admin ? 'admin' : direitos.vip ? 'VIP' : 'Premium'})`,
  })

  return NextResponse.json({ licenca })
}
