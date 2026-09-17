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
      'id, tarefa, mt5_login, primeiro_nome, sobrenome, email, telefone, indicativo, pais, data_nascimento, servidor, tipo_conta, deposito, alavancagem, tentativas',
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

  /**
   * Nas tarefas de APAGAR vai também a password actual — é ela que o MetaTrader pede para a
   * trocar. Sai daqui decifrada e só nesta resposta: é o único momento em que o agente
   * precisa dela, e guardá-la em claim em qualquer outro sítio seria guardar uma credencial
   * viva sem razão.
   */
  if (pedido.tarefa === 'apagar' && pedido.mt5_login) {
    /**
     * A password vem PRIMEIRO da própria tarefa.
     *
     * A conta é apagada da base no mesmo passo que cria esta tarefa — procurá-la pela linha da
     * conta era procurá-la onde ela já não está. A cópia na tarefa é o que sobrevive; a
     * consulta à conta fica como recurso para as tarefas antigas, criadas antes disto.
     */
    let cifrada = (pedido as { mt5_password_cifrada?: string | null }).mt5_password_cifrada ?? null
    if (!cifrada) {
      const { data: conta } = await db
        .from('mtm_trading_accounts')
        .select('mt5_password_cifrada')
        .eq('mt5_login', pedido.mt5_login)
        .maybeSingle()
      cifrada = (conta?.mt5_password_cifrada as string | null) ?? null
    }
    if (cifrada) {
      try {
        const { decifrar } = await import('@/lib/mtmfunded/credenciais')
        return NextResponse.json({ pedido: { ...pedido, password: decifrar(cifrada) } })
      } catch {
        // Sem password legível, o agente diz que não conseguiu trocar e não apaga nada — que
        // é o comportamento certo: apagar do terminal com a password viva é o pior dos casos.
      }
    }
  }

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
  /**
   * O QR REDESENHA-SE aqui, a partir do conteúdo que o agente descodificou.
   *
   * O agente também manda a imagem — um recorte do ecrã do MetaTrader — mas esse recorte
   * apanha metade do botão da App Store de um lado e um pedaço de texto do outro, porque o
   * código está encostado a eles no diálogo. Redesenhar o mesmo payload dá um código limpo,
   * nítido e quadrado, e é exactamente o mesmo conteúdo: a app lê-o igual.
   *
   * O recorte fica como recurso, para o caso de o zbar não ter conseguido descodificar.
   */
  let qr: string | null = null
  const conteudoQr = typeof body?.qrConteudo === 'string' ? body.qrConteudo.trim() : ''
  if (conteudoQr.length > 10 && conteudoQr.length < 2000) {
    try {
      const QRCode = (await import('qrcode')).default
      const buf = await QRCode.toBuffer(conteudoQr, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 420,
        color: { dark: '#0A0B0F', light: '#FFFFFF' },
      })
      qr = `data:image/png;base64,${buf.toString('base64')}`
    } catch {
      // Segue para o recorte.
    }
  }
  if (!qr && typeof body?.qr === 'string' && body.qr.length > 100 && body.qr.length < 400_000) {
    qr = `data:image/png;base64,${body.qr.replace(/^data:image\/png;base64,/, '')}`
  }

  // ── conta desactivada ────────────────────────────────────────────────────
  if (body?.desactivada === true) {
    await db
      .from('mtm_account_requests')
      .update({ estado: 'concluido', erro: null, concluido_em: new Date().toISOString() })
      .eq('id', id)
    return NextResponse.json({ ok: true })
  }

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
  /**
   * A CONTA LIGA-SE À METAAPI assim que nasce.
   *
   * Sem isto, o site tem um login e uma password e não sabe mais nada sobre a conta: nem
   * equity, nem drawdown, nem se alguém quebrou uma regra. As regras publicadas só valem
   * alguma coisa se houver quem as meça de hora a hora — e é este passo que abre essa porta.
   *
   * É BEST-EFFORT e vem depois de gravar. A MetaApi falhar não pode custar a conta que o
   * agente acabou de criar; fica sem `metaapi_account_id`, aparece no painel de admin como
   * por ligar, e repete-se com um clique.
   */
  try {
    const { data: paraLigar } = await db
      .from('mtm_trading_accounts')
      .select('id, tipo, user_id, servidor, metaapi_account_id, provider_slug')
      .eq('id', pedido.account_id)
      .maybeSingle()

    if (paraLigar && !paraLigar.metaapi_account_id) {
      const { data: dono } = paraLigar.user_id
        ? await db.from('profiles').select('full_name').eq('id', paraLigar.user_id).maybeSingle()
        : { data: null }
      const { ligarContaMetaApi, etiquetaDoTipo } = await import('@/lib/mtmfunded/metaapi')
      /**
       * As contas MESTRE ligam-se com papel de PROVIDER; as de cliente, sem papel nenhum.
       *
       * É a mesma distinção de sempre, vista do outro lado: uma conta de avaliação nunca pode
       * copiar nada, e uma conta mestre existe para ser copiada. Sem o papel, a CopyFactory
       * recusa criar a estratégia e os subscritores ficam sem fonte.
       */
      const eMestre = paraLigar.tipo === 'provider'
      const ligacao = await ligarContaMetaApi({
        login,
        password,
        servidor: (paraLigar.servidor as string) || 'TheTradingMaster-Live',
        nome: eMestre
          ? `MTM Auto · ${paraLigar.provider_slug ?? login}`
          : `${(dono?.full_name as string) || login} · ${etiquetaDoTipo(paraLigar.tipo as string)}`,
        papelProvider: eMestre,
      })
      if (ligacao.ok && ligacao.accountId) {
        await db
          .from('mtm_trading_accounts')
          .update({ metaapi_account_id: ligacao.accountId })
          .eq('id', pedido.account_id)

        /**
         * E a estratégia do MTM Auto passa a apontar para esta conta.
         *
         * Sem este passo a conta mestre existia sem ninguém saber dela: o provider continuava
         * a apontar para a conta antiga (ou para nenhuma) e os subscritores continuavam a
         * copiar o que copiavam antes — que, em três das estratégias, era uma conta a zeros.
         */
        if (eMestre && paraLigar.provider_slug) {
          const { error } = await db
            .from('mtmauto_providers')
            .update({ metaapi_account_id: ligacao.accountId, updated_at: new Date().toISOString() })
            .eq('slug', paraLigar.provider_slug as string)
          if (error) {
            console.warn('[MTMFUNDED] conta mestre ligada mas o provider não foi actualizado:', error.message)
          }

          /**
           * E a ESTRATÉGIA CopyFactory nasce aqui, no mesmo passo.
           *
           * Uma conta com papel de PROVIDER ainda não é copiável: os subscritores ligam-se a
           * uma ESTRATÉGIA, não a uma conta. Deixar este passo para depois era deixar a conta
           * mestre a negociar sem ninguém a ver — que é o estado em que três das estratégias
           * já estavam, com contas a zeros e subscritores a copiar o vazio.
           */
          try {
            const { garantirEstrategiaDaConta } = await import('@/lib/mtmfunded/estrategia-mestre')
            const e = await garantirEstrategiaDaConta(pedido.account_id as string)
            console.log(
              e.ok
                ? `[MTMFUNDED] estratégia ${e.strategyId} criada para ${paraLigar.provider_slug}`
                : `[MTMFUNDED] estratégia falhou para ${paraLigar.provider_slug}: ${e.erro}`,
            )
          } catch (e) {
            console.error('[MTMFUNDED] estratégia CopyFactory falhou:', e)
          }
        }
      } else {
        console.warn('[MTMFUNDED] conta criada mas não ligou à MetaApi:', ligacao.erro)
      }
    }
  } catch (e) {
    console.error('[MTMFUNDED] erro a ligar à MetaApi:', e)
  }

  /**
   * O EMAIL DE UMA CONTA DE TORNEIO NÃO SAI À FRENTE DO TEMPO.
   *
   * A conta pode ser emitida semanas antes — e tem de ser, porque são criadas uma a uma e não
   * há como emitir duzentas na manhã do arranque. Mas mandar as credenciais nesse momento é
   * dar semanas de treino na conta do torneio a quem se inscreveu cedo, e a prova deixa de
   * ser a mesma para toda a gente.
   *
   * Fica guardada e silenciosa; o cron da véspera envia-a a todos ao mesmo tempo.
   */
  let emailEnviado = false
  let emailAdiado = false
  try {
    const { data: paraEmail } = await db
      .from('mtm_trading_accounts')
      .select('tipo, tournament_id')
      .eq('id', pedido.account_id)
      .maybeSingle()

    if (paraEmail?.tipo === 'torneio' && paraEmail.tournament_id) {
      const { data: t } = await db
        .from('mtm_tournaments')
        .select('comeca_em')
        .eq('id', paraEmail.tournament_id)
        .maybeSingle()
      if (t?.comeca_em) {
        const vespera = new Date(t.comeca_em as string).getTime() - 24 * 3600 * 1000
        emailAdiado = Date.now() < vespera
      }
    }
  } catch {
    // Falha a ler → envia-se. Reter um email por causa de um erro de base de dados deixava o
    // participante sem conta nenhuma e sem saber porquê.
  }

  if (emailAdiado) {
    return NextResponse.json({ ok: true, accountId: pedido.account_id, emailEnviado: false, emailAdiado: true })
  }

  /**
   * As contas MESTRE não mandam email a ninguém.
   *
   * «A tua conta está pronta» não faz sentido numa conta que não é de ninguém — é
   * infraestrutura das estratégias. As credenciais ficam no painel de admin, que é onde quem
   * as precisa as vai buscar.
   */
  {
    const { data: c } = await db
      .from('mtm_trading_accounts')
      .select('tipo')
      .eq('id', pedido.account_id)
      .maybeSingle()
    if (c?.tipo === 'provider') {
      return NextResponse.json({ ok: true, accountId: pedido.account_id, emailEnviado: false, conta: 'mestre' })
    }
  }

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
      // Tipo, fase, tamanho, regras e idioma da conta real — lib/mtmfunded/entrega-conta-dados.ts.
      const { dadosDeEntrega } = await import('@/lib/mtmfunded/entrega-conta-dados')
      const dados = await dadosDeEntrega(db, conta.id as string)

      const destino = perfil?.email ?? (await db
        .from('mtm_account_requests').select('email').eq('id', id).maybeSingle()).data?.email

      if (destino && dados) {
        const { enviarEmailDaConta } = await import('@/lib/mtmfunded/email-conta')
        const { getSiteUrl } = await import('@/lib/mail-transport')
        const r = await enviarEmailDaConta({
          para: destino,
          nome: String(perfil?.full_name ?? '').split(/\s+/)[0] || destino.split('@')[0],
          // A conta inteira viaja: uma Funded anunciada como desafio dizia ao trader que ainda
          // tinha uma prova pela frente, e o nome do torneio servia de nome aos desafios.
          conta: dados.conta,
          idioma: dados.idioma,
          login,
          servidor: (conta.servidor as string) || 'TheTradingMaster-Live',
          alavancagem: Number(conta.alavancagem ?? 100),
          // O link abre o painel JÁ nas credenciais desta conta. Mandá-lo para a raiz do
          // painel obrigava a pessoa a procurar onde estava a password que o email lhe
          // prometeu — e a maior parte não procura, escreve a perguntar.
          urlPainel: `${getSiteUrl()}/mtmfunded/tradingtournament/dashboard?conta=${pedido.account_id}&credenciais=1`,
          qrMetaTrader: (conta.qrcode_url as string) ?? null,
          regras: dados.regras,
        })
        emailEnviado = r.success
      }
    }
  } catch (e) {
    console.error('[mtmfunded] conta criada mas o email falhou:', e instanceof Error ? e.message : e)
  }

  return NextResponse.json({ ok: true, accountId: pedido.account_id, emailEnviado })
}
