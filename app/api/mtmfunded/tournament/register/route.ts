import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * INSCRIÇÃO NO TORNEIO.
 *
 * Quem já é cliente inscreve-se e mantém o que é. Quem não é fica com o papel `tournament`:
 * vê o torneio, o Terminal e o scanner GoldKiller, e mais nada. Nunca se REBAIXA ninguém —
 * um membro que se inscreva num torneio não pode acordar sem os alertas que paga.
 *
 * A conta MT5 não se cria aqui: escreve-se um pedido na fila e o agente do Mac trata dela.
 * Uma função serverless não abre o MetaTrader, e fingir que abre era prometer ao
 * participante uma conta que nunca chegaria.
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!auth) return NextResponse.json({ error: 'Sessão necessária' }, { status: 401 })

  const db = getSupabaseAdmin()
  const { data: userData, error: authErr } = await db.auth.getUser(auth)
  if (authErr || !userData?.user) {
    return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })
  }
  const user = userData.user

  const body = await request.json().catch(() => ({}))
  const slug = String(body?.torneio ?? '').trim()

  const { data: torneio } = await db
    .from('mtm_tournaments')
    .select('id, slug, nome, estado, publicado, saldo_inicial, alavancagem, servidor, inscricoes_fecham_em')
    .eq(slug ? 'slug' : 'publicado', slug || true)
    .order('comeca_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!torneio || !torneio.publicado) {
    return NextResponse.json({ error: 'Torneio não encontrado' }, { status: 404 })
  }
  if (torneio.estado !== 'inscricoes') {
    return NextResponse.json({ error: 'As inscrições não estão abertas' }, { status: 409 })
  }
  if (torneio.inscricoes_fecham_em && new Date(torneio.inscricoes_fecham_em) < new Date()) {
    return NextResponse.json({ error: 'As inscrições já fecharam' }, { status: 409 })
  }

  const { data: perfil } = await db
    .from('profiles')
    .select('id, full_name, email, user_type, is_active')
    .eq('id', user.id)
    .maybeSingle()

  const nome = String(body?.nome ?? perfil?.full_name ?? '').trim()
  const email = String(perfil?.email ?? user.email ?? '').trim()
  if (!nome || !email) {
    return NextResponse.json({ error: 'Nome e email são obrigatórios' }, { status: 400 })
  }

  /**
   * OS DADOS DA CORRETORA.
   *
   * O formulário do MetaTrader exige nome, apelido, telemóvel e data de nascimento, e o
   * telemóvel só é aceite com o PAÍS certo escolhido — o indicativo vem do IP do servidor
   * (a AWS dá Suécia) e um número português por baixo de +46 é recusado. O agente tem
   * valores por omissão para não ficar parado, mas usá-los significava abrir uma conta em
   * nome desta pessoa com um telefone que não é dela.
   */
  const { PAISES } = await import('@/lib/mtmfunded/paises')
  const primeiroNome = String(body?.primeiroNome ?? nome.split(/\s+/)[0] ?? '').trim()
  const apelido = String(body?.apelido ?? '').trim()
  const telefone = String(body?.telefone ?? '').replace(/\D/g, '')
  const nascimento = String(body?.dataNascimento ?? '').trim()
  const pais = PAISES.find((p) => p.codigo === String(body?.pais ?? 'PT')) ?? PAISES[0]

  if (primeiroNome.length < 2 || apelido.length < 2) {
    return NextResponse.json({ error: 'Indica o primeiro nome e o apelido' }, { status: 400 })
  }
  if (telefone.length < 6) {
    return NextResponse.json({ error: 'Indica um número de telemóvel válido' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) {
    return NextResponse.json({ error: 'Indica a data de nascimento' }, { status: 400 })
  }
  // Maior de idade: é uma conta de negociação, mesmo sendo demo, e a corretora exige-o.
  const anos = (Date.now() - new Date(nascimento).getTime()) / (365.25 * 24 * 3600 * 1000)
  if (!(anos >= 18 && anos <= 100)) {
    return NextResponse.json({ error: 'A data de nascimento não é válida' }, { status: 400 })
  }

  // Já inscrito? Devolve-se o que existe em vez de duplicar — carregar duas vezes no botão
  // não pode dar duas contas MT5 à mesma pessoa.
  const { data: jaInscrito } = await db
    .from('mtm_tournament_participants')
    .select('id, estado, account_id')
    .eq('tournament_id', torneio.id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (jaInscrito) {
    return NextResponse.json({ ok: true, jaEstavaInscrito: true, participanteId: jaInscrito.id })
  }

  /**
   * O papel só SOBE, nunca desce.
   *
   * `tournament` é o mínimo, para quem chegou por aqui. Um membro, VIP ou admin que se
   * inscreva mantém o que tem: escrever `tournament` por cima tirava-lhe os alertas e os
   * scanners que paga, e ninguém ligaria as duas coisas.
   */
  if (!perfil) {
    await db.from('profiles').insert({
      id: user.id, email, full_name: nome,
      user_type: 'tournament', member_category: 'standard', is_active: true,
    })
  } else if (!perfil.user_type || perfil.user_type === 'pending' || perfil.user_type === 'guest' || perfil.user_type === 'inactive') {
    await db.from('profiles').update({ user_type: 'tournament', is_active: true }).eq('id', user.id)
  }

  // A conta primeiro (é ela que o pedido referencia), depois a inscrição, depois a fila.
  const { data: conta, error: erroConta } = await db
    .from('mtm_trading_accounts')
    .insert({
      user_id: user.id,
      tipo: 'torneio',
      tournament_id: torneio.id,
      servidor: torneio.servidor,
      saldo_inicial: torneio.saldo_inicial,
      alavancagem: torneio.alavancagem,
      estado: 'pedida',
    })
    .select('id')
    .single()
  if (erroConta || !conta) {
    return NextResponse.json({ error: 'Não foi possível criar a conta' }, { status: 500 })
  }

  const { data: participante, error: erroPart } = await db
    .from('mtm_tournament_participants')
    .insert({
      tournament_id: torneio.id,
      user_id: user.id,
      account_id: conta.id,
      nome_publico: nome,
      email,
      estado: 'inscrito',
      telefone,
      indicativo: pais.indicativo,
      data_nascimento: nascimento,
      pais: pais.codigo,
    })
    .select('id')
    .single()
  if (erroPart) {
    // Sem inscrição, a conta não serve para nada — e uma conta órfã acaba por ser criada
    // pelo agente e enviada a alguém que não está em torneio nenhum.
    await db.from('mtm_trading_accounts').delete().eq('id', conta.id)
    return NextResponse.json({ error: 'Não foi possível inscrever' }, { status: 500 })
  }

  const { apelidoComTipo } = await import('@/lib/mtmfunded/metaapi')
  await db.from('mtm_account_requests').insert({
    account_id: conta.id,
    primeiro_nome: primeiroNome,
    // O apelido leva o TIPO: «Garcia Torneio». A corretora não tem campo para o tipo de
    // conta, e sem ele ninguém distingue um participante de torneio de um trader financiado
    // numa lista — e as regras, os contratos e os pagamentos são diferentes.
    sobrenome: apelidoComTipo(apelido, 'torneio'),
    email,
    telefone,
    indicativo: pais.indicativo,
    pais: pais.codigo,
    data_nascimento: nascimento,
    servidor: torneio.servidor,
    tipo_conta: 'ECN',
    deposito: torneio.saldo_inicial,
    alavancagem: torneio.alavancagem,
    estado: 'em_fila',
  })

  return NextResponse.json({
    ok: true,
    participanteId: participante.id,
    contaId: conta.id,
    mensagem: 'Inscrição registada. A conta de torneio é emitida e enviada por email.',
  })
}
