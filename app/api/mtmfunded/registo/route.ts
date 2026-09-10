import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * REGISTO PRÓPRIO DO MTM FUNDED.
 *
 * Existe porque o `/register` do site não serve aqui: ele encaminha para a venda de packs da
 * MTM, e quem chega ao MTM Funded vem comprar uma avaliação ou entrar num torneio. Mandá-lo
 * para lá é oferecer-lhe outro produto no meio de uma decisão — e, pior, sugerir-lhe que as
 * duas coisas são a mesma empresa quando o resto do site diz que não são.
 *
 * A CONTA É A MESMA. Grava na mesma base de dados e na mesma tabela `profiles`: quem já for
 * cliente da MTM entra aqui com as credenciais que tem, e quem se registar aqui pode um dia
 * usar o site. O que muda é o PAPEL com que nasce.
 *
 * E o papel só SOBE. `tournament` é o mínimo, para quem chegou por aqui. Um membro, VIP ou
 * admin que se registe mantém o que tem: escrever `tournament` por cima tirava-lhe os
 * alertas e os scanners que paga, e ninguém ligaria as duas coisas.
 */

/** Papéis que já valem mais do que `tournament`. Nenhum destes é rebaixado. */
const PAPEIS_ACIMA = new Set([
  'member', 'membro', 'premium', 'vip', 'founder', 'fundador', 'admin', 'superadmin', 'educator',
])

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const email = String(body?.email ?? '').trim().toLowerCase()
  const password = String(body?.password ?? '')
  const nome = String(body?.nome ?? '').trim()

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'A palavra-passe precisa de pelo menos 8 caracteres' }, { status: 400 })
  }
  if (nome.length < 3) {
    return NextResponse.json({ error: 'Indica o teu nome' }, { status: 400 })
  }

  const db = getSupabaseAdmin()

  const { data: criado, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: nome, origem: 'mtmfunded' },
  })

  if (error) {
    /**
     * Email já registado: NÃO se diz que já existe.
     *
     * Uma mensagem que distingue «já existe» de «não existe» transforma este formulário num
     * verificador de contas: escreve-se uma lista de emails e fica-se a saber quais são
     * clientes. Diz-se antes o que a pessoa deve fazer, que é entrar.
     */
    const jaExiste = /already|exists|registered|duplicate/i.test(error.message ?? '')
    return NextResponse.json(
      {
        error: jaExiste
          ? 'Não foi possível criar a conta com esse email. Se já tens conta MoreThanMoney, entra com ela.'
          : 'Não foi possível criar a conta',
        entrar: jaExiste,
      },
      { status: jaExiste ? 409 : 400 },
    )
  }

  const id = criado.user?.id
  if (!id) return NextResponse.json({ error: 'Não foi possível criar a conta' }, { status: 500 })

  const { data: perfil } = await db
    .from('profiles')
    .select('id, user_type')
    .eq('id', id)
    .maybeSingle()

  const papelAtual = String(perfil?.user_type ?? '').toLowerCase()
  const manter = PAPEIS_ACIMA.has(papelAtual)

  if (!perfil) {
    await db.from('profiles').insert({
      id,
      email,
      full_name: nome,
      user_type: 'tournament',
      member_category: 'standard',
      is_active: true,
    })
  } else if (!manter) {
    await db.from('profiles').update({ user_type: 'tournament', is_active: true }).eq('id', id)
  }

  return NextResponse.json({ ok: true })
}
