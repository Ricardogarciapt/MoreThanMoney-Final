import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { cifrar, cifraDisponivel } from '@/lib/mtmfunded/credenciais'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * A porta do AGENTE MT5 — o programa que corre no Mac do Ricardo e cria as contas demo.
 *
 * Porque existe uma fila e não uma chamada directa: nenhuma função serverless abre o
 * MetaTrader. O site escreve o pedido, o agente reclama-o quando puder, e devolve as
 * credenciais. Se o Mac estiver desligado, o pedido espera — não se perde.
 *
 * GET  ?token=…            → reclama UM pedido (ou devolve vazio)
 * POST { token, id, ... }  → entrega o resultado: credenciais ou erro
 *
 * O token é partilhado (`MTMFUNDED_AGENT_SECRET`) e comparado em tempo constante: um
 * `===` sobre segredos deixa medir onde falha, caractere a caractere.
 */

/**
 * Há transmissão a decorrer?
 *
 * O MT5 vive no MESMO VPS que a transmissão, e são 2 vCPU partilhados com o SRS, o nginx e o
 * ffmpeg do DVR. Criar contas a meio de uma sessão ao vivo é competir por CPU com aquilo que
 * os clientes estão a ver — e o que se estraga na transmissão não se recupera.
 *
 * A regra vive no SERVIDOR e não no agente: assim vale para qualquer agente, agora e depois.
 * Em pausa não se reclama nada; a fila espera, que é o que ela sabe fazer.
 */
async function haTransmissao(): Promise<boolean> {
  try {
    const { count } = await getSupabaseAdmin()
      .from('lms_streams')
      .select('id', { count: 'exact', head: true })
      .eq('is_live', true)
    return (count ?? 0) > 0
  } catch {
    // Falha a ler → assume-se que NÃO há transmissão. O contrário parava a emissão de contas
    // por causa de um erro de base de dados, e ninguém perceberia porquê.
    return false
  }
}

function tokenValido(recebido: string | null | undefined): boolean {
  const esperado = process.env.MTMFUNDED_AGENT_SECRET
  if (!esperado || esperado.length < 16) return false
  const a = Buffer.from(String(recebido ?? ''))
  const b = Buffer.from(esperado)
  if (a.length !== b.length) return false
  let diferenca = 0
  for (let i = 0; i < a.length; i++) diferenca |= a[i] ^ b[i]
  return diferenca === 0
}

/**
 * Reclama o pedido mais antigo em fila — ou apenas ESPREITA, com `?peek=1`.
 *
 * O espreitar existe porque reclamar é destrutivo. O agente em modo assistido precisa de
 * alguém a escrever no terminal; quando corre como serviço (sem terminal) não pode reclamar
 * nada — reclamou uma vez em testes, não teve a quem perguntar, e queimou as três tentativas
 * do pedido em segundos, deixando-o morto. Sem terminal, espreita-se e avisa-se.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? request.headers.get('x-agent-token')
  if (!tokenValido(token)) return NextResponse.json({ error: 'não autorizado' }, { status: 401 })

  const db = getSupabaseAdmin()

  if (await haTransmissao()) {
    const { count } = await db
      .from('mtm_account_requests')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'em_fila')
      .lt('tentativas', 3)
    return NextResponse.json({
      pedido: null,
      emFila: count ?? 0,
      emPausa: true,
      motivo: 'transmissão a decorrer — a emissão de contas retoma quando terminar',
    })
  }

  if (request.nextUrl.searchParams.get('peek') === '1') {
    const { count } = await db
      .from('mtm_account_requests')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'em_fila')
      .lt('tentativas', 3)
    return NextResponse.json({ emFila: count ?? 0 })
  }
  const { data: pedido } = await db
    .from('mtm_account_requests')
    .select(
      'id, primeiro_nome, sobrenome, email, telefone, data_nascimento, servidor, tipo_conta, deposito, alavancagem, tentativas',
    )
    .eq('estado', 'em_fila')
    .lt('tentativas', 3)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!pedido) return NextResponse.json({ pedido: null })

  /**
   * Marca-se como reclamado ANTES de responder, e só se a linha ainda estiver em fila.
   * Dois agentes a correr (ou um a reiniciar a meio) criariam a mesma conta duas vezes —
   * duas contas reais para o mesmo participante, e nenhuma forma de saber qual vale.
   */
  const { data: reclamado } = await db
    .from('mtm_account_requests')
    .update({
      estado: 'reclamado',
      reclamado_em: new Date().toISOString(),
      tentativas: (pedido.tentativas ?? 0) + 1,
    })
    .eq('id', pedido.id)
    .eq('estado', 'em_fila')
    .select('id')
    .maybeSingle()

  if (!reclamado) return NextResponse.json({ pedido: null })
  return NextResponse.json({ pedido })
}

/** O agente devolve o resultado. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  if (!tokenValido(body?.token ?? request.headers.get('x-agent-token'))) {
    return NextResponse.json({ error: 'não autorizado' }, { status: 401 })
  }
  const id = String(body?.id ?? '')
  if (!id) return NextResponse.json({ error: 'id em falta' }, { status: 400 })

  const db = getSupabaseAdmin()
  const { data: pedido } = await db
    .from('mtm_account_requests')
    .select('id, account_id, tentativas')
    .eq('id', id)
    .maybeSingle()
  if (!pedido) return NextResponse.json({ error: 'pedido desconhecido' }, { status: 404 })

  /**
   * O QR do MetaTrader, quando o agente o conseguiu recortar.
   *
   * Guarda-se como data URI na própria linha da conta, e não num balde público de ficheiros:
   * este código traz as credenciais codificadas — é por isso que entra com um toque — e um
   * URL público seria a conta aberta a quem descobrisse o endereço. Aqui só sai por rotas
   * que verificam de quem é a conta.
   */
  const qr =
    typeof body?.qr === 'string' && body.qr.length > 100 && body.qr.length < 400_000
      ? `data:image/png;base64,${body.qr.replace(/^data:image\/png;base64,/, '')}`
      : null

  // ── falhou ───────────────────────────────────────────────────────────────
  if (body?.erro) {
    const desiste = (pedido.tentativas ?? 0) >= 3
    // Mesmo a falhar, o que se conseguiu guarda-se. Uma conta criada sem password legível
    // continua a ser utilizável pelo QR — deitar fora o código com o erro fechava a única
    // porta que lhe restava.
    if (qr || body?.login) {
      await db
        .from('mtm_trading_accounts')
        .update({
          ...(qr ? { qrcode_url: qr } : {}),
          ...(body?.login ? { mt5_login: String(body.login).trim() } : {}),
          ...(body?.servidor ? { servidor: String(body.servidor) } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', pedido.account_id)
    }
    await db
      .from('mtm_account_requests')
      .update({
        estado: desiste ? 'erro' : 'em_fila', // volta à fila até à terceira
        erro: String(body.erro).slice(0, 500),
      })
      .eq('id', id)
    if (desiste) {
      await db
        .from('mtm_trading_accounts')
        .update({ estado: 'cancelada', quebrou_regra: 'criação falhou 3 vezes' })
        .eq('id', pedido.account_id)
    }
    return NextResponse.json({ ok: true, voltouAFila: !desiste })
  }

  // ── conseguiu ────────────────────────────────────────────────────────────
  const login = String(body?.login ?? '').trim()
  const password = String(body?.password ?? '')
  if (!login || !password) {
    return NextResponse.json({ error: 'login e password são obrigatórios' }, { status: 400 })
  }
  if (!cifraDisponivel()) {
    // Falha ANTES de gravar: uma password em claro numa coluna que se chama "cifrada"
    // é pior do que não ter conta nenhuma.
    return NextResponse.json({ error: 'MTMFUNDED_CRED_KEY não configurada' }, { status: 503 })
  }

  const patch: Record<string, unknown> = {
    mt5_login: login,
    mt5_password_cifrada: cifrar(password),
    mt5_investor_cifrada: body?.investor ? cifrar(String(body.investor)) : null,
    estado: 'ativa',
    updated_at: new Date().toISOString(),
  }
  if (qr) patch.qrcode_url = qr
  if (body?.servidor) patch.servidor = String(body.servidor)

  await db.from('mtm_trading_accounts').update(patch).eq('id', pedido.account_id)

  await db
    .from('mtm_account_requests')
    .update({ estado: 'concluido', erro: null, concluido_em: new Date().toISOString() })
    .eq('id', id)

  /**
   * A conta só serve depois de chegar a quem é. O envio é BEST-EFFORT e vem depois de
   * gravar: se o email falhar, a conta continua a existir e reenvia-se do painel. Ao
   * contrário — falhar o pedido porque o email não saiu — perdia-se a conta que o operador
   * acabou de criar à mão no MetaTrader, e essa não se recupera.
   */
  let emailEnviado = false
  try {
    const { data: conta } = await db
      .from('mtm_trading_accounts')
      .select('id, tipo, user_id, servidor, saldo_inicial, alavancagem, tournament_id, qrcode_url')
      .eq('id', pedido.account_id)
      .maybeSingle()

    if (conta) {
      const { data: perfil } = conta.user_id
        ? await db.from('profiles').select('full_name, email').eq('id', conta.user_id).maybeSingle()
        : { data: null }
      const { data: torneio } = conta.tournament_id
        ? await db.from('mtm_tournaments').select('nome, regras').eq('id', conta.tournament_id).maybeSingle()
        : { data: null }

      const destino = perfil?.email ?? (await db
        .from('mtm_account_requests').select('email').eq('id', id).maybeSingle()).data?.email

      if (destino) {
        const { enviarEmailDaConta } = await import('@/lib/mtmfunded/email-conta')
        const { getSiteUrl } = await import('@/lib/mail-transport')
        const r = await enviarEmailDaConta({
          para: destino,
          nome: (perfil?.full_name as string) || destino.split('@')[0],
          tipo: conta.tipo === 'torneio' ? 'torneio' : 'desafio',
          nomeProva: (torneio?.nome as string) || 'MTM Funded',
          login,
          servidor: (conta.servidor as string) || 'TheTradingMaster-Live',
          saldo: Number(conta.saldo_inicial ?? 0),
          alavancagem: Number(conta.alavancagem ?? 100),
          urlPainel: `${getSiteUrl()}/mtmfunded/tradingtournament/dashboard`,
          qrMetaTrader: (conta.qrcode_url as string) ?? null,
          regras: (torneio?.regras ?? null) as Record<string, number | string> | null,
        })
        emailEnviado = r.success
      }
    }
  } catch (e) {
    console.error('[mtmfunded] conta criada mas o email falhou:', e instanceof Error ? e.message : e)
  }

  return NextResponse.json({ ok: true, accountId: pedido.account_id, emailEnviado })
}
