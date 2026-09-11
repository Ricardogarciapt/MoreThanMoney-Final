import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { decifrar } from '@/lib/mtmfunded/credenciais'

export const dynamic = 'force-dynamic'
export const maxDuration = 15

/**
 * A password da conta, para o DONO da conta.
 *
 * O email diz que a password está no painel, e é esta rota que a põe lá. Enquanto não
 * existiu, o email prometia uma coisa que o site não fazia — o participante recebia a conta,
 * clicava no link e não encontrava nada.
 *
 * Três decisões que a tornam segura:
 *
 * · A conta é procurada PELO DONO, não pelo id. `.eq('user_id', user.id)` no mesmo select
 *   que a vai buscar: um id de conta alheio não devolve nada, em vez de devolver e só depois
 *   verificar — que é onde estas coisas costumam correr mal.
 * · É POST e não GET: uma password num URL fica no histórico do browser, nos registos do
 *   servidor e no cabeçalho `Referer` da página seguinte.
 * · Não se guarda em lado nenhum do lado do cliente. Pede-se quando se quer ver, e o
 *   componente esquece-a ao sair.
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!auth) return NextResponse.json({ error: 'Sessão necessária' }, { status: 401 })

  const db = getSupabaseAdmin()
  const { data: userData, error } = await db.auth.getUser(auth)
  if (error || !userData?.user) {
    return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const contaId = String(body?.contaId ?? '').trim()
  if (!contaId) return NextResponse.json({ error: 'contaId em falta' }, { status: 400 })

  const { data: conta } = await db
    .from('mtm_trading_accounts')
    .select('id, mt5_login, servidor, mt5_password_cifrada, mt5_investor_cifrada, estado, tipo, tournament_id')
    .eq('id', contaId)
    .eq('user_id', userData.user.id)
    .maybeSingle()

  // Conta inexistente e conta de outra pessoa dão a MESMA resposta. Distingui-las deixava
  // adivinhar quais os ids que existem.
  if (!conta) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })

  /**
   * CONTAS DE TORNEIO: as credenciais só abrem na VÉSPERA.
   *
   * A conta pode ser emitida semanas antes — e é bom que seja, porque são criadas uma a uma e
   * não há como emitir duzentas na manhã do arranque. Mas dar as credenciais nesse momento é
   * dar a toda a gente semanas de treino na própria conta do torneio, e o que se avalia
   * deixa de ser o mesmo para quem se inscreveu cedo e para quem se inscreveu tarde.
   *
   * A porta é fechada AQUI, no servidor. Escondê-la só no ecrã deixava-a aberta a quem
   * chamasse a rota à mão.
   */
  if (conta.tipo === 'torneio' && conta.tournament_id) {
    const { data: torneio } = await db
      .from('mtm_tournaments')
      .select('nome, comeca_em')
      .eq('id', conta.tournament_id)
      .maybeSingle()

    if (torneio?.comeca_em) {
      const abrem = new Date(torneio.comeca_em as string).getTime() - 24 * 3600 * 1000
      if (Date.now() < abrem) {
        return NextResponse.json({
          login: conta.mt5_login,
          servidor: conta.servidor,
          password: null,
          bloqueada: true,
          abrePor: new Date(abrem).toISOString(),
          aviso:
            'As credenciais desta conta abrem na véspera do torneio. Recebes um email nesse dia, com os dados e o código QR.',
        })
      }
    }
  }

  if (!conta.mt5_password_cifrada) {
    return NextResponse.json({
      login: conta.mt5_login,
      servidor: conta.servidor,
      password: null,
      aviso:
        conta.estado === 'ativa'
          ? 'A conta existe mas a palavra-passe não ficou guardada. Pede a reemissão pelo apoio.'
          : 'A conta ainda está a ser emitida.',
    })
  }

  let password: string | null = null
  let investor: string | null = null
  try {
    password = decifrar(conta.mt5_password_cifrada as string)
    if (conta.mt5_investor_cifrada) investor = decifrar(conta.mt5_investor_cifrada as string)
  } catch {
    // Chave trocada ou registo corrompido. Não se devolve lixo como se fosse a password:
    // uma password errada faz a pessoa julgar que a conta não presta.
    return NextResponse.json({ error: 'Não foi possível ler a palavra-passe' }, { status: 500 })
  }

  return NextResponse.json({
    login: conta.mt5_login,
    servidor: conta.servidor,
    password,
    investor,
  })
}
