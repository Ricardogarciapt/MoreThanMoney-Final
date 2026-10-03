/**
 * O QUE UM EMAIL DE ENTREGA DE CONTA MTM FUNDED DIZ — decidido pela CONTA, num sítio só.
 *
 * Porque existe (17/09): os emails de entrega tratavam uma conta Funded como um desafio e o
 * tamanho da conta não aparecia (ou aparecia errado). Casos reais:
 *   · a conta Funded era emitida com o motivo «fase» e recebia «A tua nova conta MTM Funded (fase
 *     seguinte)» / «Passaste de fase e abrimos a conta seguinte»;
 *   · o envio de 15/09 às contas financiadas de 1K levou «Conta Funded · 1K · 1 fase» e a linha
 *     «Programa: 1K · 1 fase» — o nome de um DESAFIO numa conta financiada — sem linha de tamanho,
 *     e as financiadas sem programa (3K, 10K) não diziam tamanho nenhum;
 *   · o email da oferta tinha «10K», «2 fases» e «Fase 1 de 2» escritos à mão;
 *   · o email das contas MT5 caía para «0 USD» quando faltava o saldo.
 *
 * Regras que este ficheiro garante (e __tests__/email-tipo-conta.check.ts fixa):
 *   · o TIPO vem de `mtm_trading_accounts.tipo` + `metricas` (fase, analise, oferta) + o programa
 *     (`fases`); o motivo do envio (criação, fase, reenvio…) só muda a frase de abertura;
 *   · o TAMANHO vem de `saldo_inicial` e, na falta, do `saldo` do programa — nunca de um valor por
 *     defeito. Sem nenhum dos dois, a linha do tamanho simplesmente não aparece;
 *   · nada aqui leva password (nem tem onde).
 *
 * Puro: sem base de dados nem transporte — os dados lêem-se em ./entrega-conta-dados.ts.
 */
import type { MotivoLink } from './credenciais-link'
import { avisoDaConta } from './aviso-conta'

export type Idioma = 'pt' | 'en'
export type TipoEntrega = 'desafio' | 'oferta' | 'funded' | 'real' | 'auditoria' | 'encerrada' | 'analise' | 'torneio' | 'mestre'

export interface ContaEntrega {
  /** `mtm_trading_accounts.tipo` */
  tipo: string
  estado?: string | null
  /** `mtm_trading_accounts.saldo_inicial` */
  saldoInicial: number | string | null | undefined
  /** `metricas.fase` (sem ela, é a 1.ª) */
  fase?: number | string | null
  /** `mtm_funded_programs.fases` */
  fases?: number | string | null
  programaNome?: string | null
  /** `mtm_funded_programs.saldo` — só como recurso se a conta não tiver saldo. */
  programaSaldo?: number | string | null
  /** `metricas.oferta` (oferta de gratidão) */
  ofertaMarca?: string | null
  /** a compra desta conta tem `estado='oferta'` (oferta da renovação) */
  ofertaRenovacao?: boolean
  /** `metricas.analise` — conta sem regras de avaliação (acompanhamento de estratégias, T2T, casa) */
  analise?: boolean
  /** `conta_real_casa` (109) — conta real da casa: é Funded («contém negociação real») mesmo sem regras. */
  contaReal?: boolean
  torneioNome?: string | null
}

const positivo = (v: unknown): number | null => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** O tamanho da conta: saldo inicial, senão o do programa. Nunca um valor inventado. */
export function tamanhoDaConta(c: Pick<ContaEntrega, 'saldoInicial' | 'programaSaldo'>): number | null {
  return positivo(c.saldoInicial) ?? positivo(c.programaSaldo)
}

/** 10000 → «10K», 2500 → «2.5K», 1000000 → «1M». */
export function tamanhoCurto(n: number | null): string | null {
  if (n == null) return null
  const fmt = (x: number) => String(Math.round(x * 10) / 10)
  if (n >= 1_000_000) return `${fmt(n / 1_000_000)}M`
  if (n >= 1_000) return `${fmt(n / 1_000)}K`
  return String(Math.round(n))
}

/**
 * «10 000 USD» (pt) / «10,000 USD» (en). O agrupamento é feito à mão: o `toLocaleString` do Node
 * usa espaços especiais que variam com a versão do ICU e partem os testes e alguns clientes de email.
 */
export function tamanhoLongo(n: number | null, idioma: Idioma): string | null {
  if (n == null) return null
  const inteiro = Number.isInteger(n)
  const [int, dec] = (inteiro ? String(n) : n.toFixed(2)).split('.')
  const agrupado = int.replace(/\B(?=(\d{3})+(?!\d))/g, idioma === 'pt' ? ' ' : ',')
  const decimal = dec ? `${idioma === 'pt' ? ',' : '.'}${dec}` : ''
  return `${agrupado}${decimal} USD`
}

export function faseDaConta(c: Pick<ContaEntrega, 'fase'>): number {
  const f = Number(c.fase ?? 1)
  return Number.isFinite(f) && f >= 2 ? Math.floor(f) : 1
}

export function fasesDoPrograma(c: Pick<ContaEntrega, 'fases'>): number | null {
  const f = Number(c.fases)
  return Number.isFinite(f) && f >= 1 ? Math.floor(f) : null
}

/**
 * O que a conta É, para o email — pela MESMA função que decide a faixa do WebTrader.
 *
 * Isto era um segundo `avisoDaConta()` escrito à mão, e faltavam-lhe três casos com consequências:
 *   · `tipo = 'real'` (capital do cliente, 19/09) caía no `default` e o dono de uma Conta Real
 *     recebia um email de DESAFIO, com «F1 · Fase 1» na tabela;
 *   · os estados fechados não existiam: uma Funded QUEBRADA recebia «contém negociação real de
 *     capital patrocinado» — um convite a negociar numa conta que já não negoceia;
 *   · a conta de auditoria da casa (`conta_real_casa`) dizia-se Funded de cliente.
 * Agora a pergunta faz-se uma vez, em ./aviso-conta.ts, e o email só traduz a resposta.
 */
export function tipoDeEntrega(c: ContaEntrega): TipoEntrega {
  // Um desafio oferecido só se anuncia como oferta na 1.ª fase; a F2 já é o desafio a correr.
  const ofertaNaPrimeira = (c.ofertaMarca || c.ofertaRenovacao) && faseDaConta(c) === 1
  switch (avisoDaConta({
    tipo: c.tipo,
    estado: c.estado ?? null,
    metricas: c.analise ? { analise: true } : null,
    contaReal: c.contaReal ?? null,
  })) {
    case 'torneio': return 'torneio'
    case 'mestre': return 'mestre'
    case 'funded': return 'funded'
    case 'real': return 'real'
    case 'auditoria': return 'auditoria'
    case 'funded_encerrada': return 'encerrada'
    case 'analise': return 'analise'
    // Avaliação a correr, concluída ou terminada: para quem recebe o email é sempre o desafio dele.
    default: return ofertaNaPrimeira ? 'oferta' : 'desafio'
  }
}

export interface TextosEntrega {
  tipo: TipoEntrega
  assunto: string
  cabecalho: string
  /** «F1 · Desafio 10K» — por baixo do cabeçalho */
  subtitulo: string
  frase: string
  /** Linhas da tabela, além de Login e Servidor (rótulo → valor). */
  linhas: Array<[string, string]>
  /** O aviso do rodapé (simulada vs. Funded). */
  aviso: string
  /** A conta tem negociação real (Funded aprovada). */
  real: boolean
  rotulos: {
    ola: (nome: string) => string
    login: string
    servidor: string
    dadosAcesso: string
    semPassword: (expira: string) => string
    semPasswordTexto: (expira: string) => string
    verCredenciais: string
    abrirWebtrader: string
    nuncaPedimos: string
    locale: string
  }
}

/** Monta os textos de um email de entrega/credenciais para uma conta concreta. */
export function textosDaEntrega(c: ContaEntrega, motivo: MotivoLink, idioma: Idioma): TextosEntrega {
  const pt = idioma === 'pt'
  const tipo = tipoDeEntrega(c)
  const tam = tamanhoDaConta(c)
  const K = tamanhoCurto(tam)
  const longo = tamanhoLongo(tam, idioma)
  const fase = faseDaConta(c)
  const fases = fasesDoPrograma(c)
  const deTam = K ? (pt ? ` de ${K}` : ` ${K}`) : ''
  const paren = K ? ` (${K})` : ''

  // ── o nome do produto, dito de uma maneira só ──
  const nFases = fases == null ? '' : pt ? ` · ${fases} ${fases === 1 ? 'fase' : 'fases'}` : ` · ${fases} ${fases === 1 ? 'phase' : 'phases'}`
  const desafioNome = pt ? `Desafio MTM Funded${K ? ` ${K}` : ''}${nFases}` : `MTM Funded${K ? ` ${K}` : ''} Challenge${nFases}`
  const faseTxt = fases && fases > 1
    ? (pt ? `Fase ${fase} de ${fases}` : `Phase ${fase} of ${fases}`)
    : fases === 1 ? (pt ? 'Fase única' : 'Single phase') : (pt ? `Fase ${fase}` : `Phase ${fase}`)
  const torneio = c.torneioNome || 'Trading Tournament'

  let rotulo: string // «Tipo de conta»
  let produtoCurto: string // usado nos assuntos dos motivos administrativos
  switch (tipo) {
    case 'desafio':
    case 'oferta':
      rotulo = `F${fase} · ${faseTxt}`
      produtoCurto = `${desafioNome}${fases && fases > 1 ? ` · ${pt ? 'Fase' : 'Phase'} ${fase}` : ''}`
      break
    case 'funded':
      rotulo = 'Funded'
      produtoCurto = pt ? `Funded MTM${K ? ` ${K}` : ''}` : `MTM Funded${K ? ` ${K}` : ''} account`
      break
    // Conta Real: dinheiro do cliente, sem fases nem regras (lib/mtmfunded/etiquetas::tipoCurto).
    case 'real':
      rotulo = 'Real'
      produtoCurto = pt ? `Real${K ? ` ${K}` : ''}` : `Real${K ? ` ${K}` : ''} account`
      break
    // Conta da casa que negoceia a sério para auditar as estratégias (conta_real_casa, 109).
    case 'auditoria':
      rotulo = pt ? 'Conta de auditoria' : 'Audit account'
      produtoCurto = pt ? `de auditoria MTM Funded${paren}` : `MTM Funded audit account${paren}`
      break
    case 'encerrada':
      rotulo = pt ? 'Encerrada' : 'Closed'
      produtoCurto = pt ? `MTM Funded${K ? ` ${K}` : ''} (encerrada)` : `MTM Funded${K ? ` ${K}` : ''} account (closed)`
      break
    case 'analise':
      rotulo = pt ? 'Conta de análise' : 'Analysis account'
      produtoCurto = pt ? `de análise MTM Funded${paren}` : `MTM Funded analysis account${paren}`
      break
    case 'torneio':
      rotulo = pt ? 'Torneio' : 'Tournament'
      produtoCurto = pt ? `de torneio · ${torneio}${paren}` : `${torneio} tournament account${paren}`
      break
    default:
      rotulo = pt ? 'Conta-mestre de estratégia' : 'Strategy master account'
      produtoCurto = pt ? `conta-mestre MTM Funded${paren}` : `MTM Funded master account${paren}`
  }
  // «a tua conta Funded MTM 10K» vs «a tua conta de análise…»: os desafios dizem-se sem «conta».
  const aTuaConta = pt
    ? (tipo === 'desafio' || tipo === 'oferta' ? `o teu ${produtoCurto}` : `a tua conta ${produtoCurto}`)
    : `your ${produtoCurto}`

  // ── assunto, cabeçalho e frase ──
  let assunto: string
  let cabecalho: string
  let frase: string
  const entrega = motivo === 'criacao' || motivo === 'fase'
  if (entrega) {
    switch (tipo) {
      case 'desafio':
        if (motivo === 'fase' && fase >= 2) {
          assunto = pt ? `Passaste à Fase ${fase}: a tua nova conta do ${desafioNome}` : `You reached Phase ${fase}: your new ${desafioNome} account`
          cabecalho = pt ? `Bem-vindo à Fase ${fase}` : `Welcome to Phase ${fase}`
          frase = pt
            ? `Passaste a Fase ${fase - 1} do teu ${desafioNome} e abrimos a conta da ${faseTxt}${fases === fase ? ' — a última' : ''}. Cumpre o objectivo desta fase dentro das regras${fases === fase ? ' e ficas apto à conta Funded' : ''}.`
            : `You passed Phase ${fase - 1} of your ${desafioNome} and we opened the account for ${faseTxt}${fases === fase ? ' — the last one' : ''}. Hit this phase's target within the rules${fases === fase ? ' and you qualify for the Funded account' : ''}.`
        } else {
          assunto = pt
            ? `O teu ${desafioNome} está activo${fases && fases > 1 ? ` — Fase ${fase}` : ''}`
            : `Your ${desafioNome} is active${fases && fases > 1 ? ` — Phase ${fase}` : ''}`
          cabecalho = pt ? 'O teu desafio começou' : 'Your challenge has started'
          frase = fases === 1
            ? (pt
              ? `O teu ${desafioNome} está activo. É um desafio de uma só fase: cumpre o objectivo dentro das regras e ficas apto à conta Funded.`
              : `Your ${desafioNome} is active. It is a single-phase challenge: hit the target within the rules and you qualify for the Funded account.`)
            : (pt
              ? `O teu ${desafioNome} está activo e estás na ${faseTxt}. Cumpre o objectivo desta fase dentro das regras e abrimos a conta da fase seguinte.`
              : `Your ${desafioNome} is active and you are in ${faseTxt}. Hit this phase's target within the rules and we open the next phase's account.`)
        }
        break
      case 'oferta':
        assunto = pt ? `Oferta: o teu ${desafioNome} está activo` : `Gift: your ${desafioNome} is active`
        cabecalho = pt ? 'Um desafio oferecido' : 'A challenge on us'
        frase = pt
          ? `Oferecemos-te um ${desafioNome}, já activo em teu nome e sem custo${fases && fases > 1 ? `. Estás na ${faseTxt}` : ''}. As regras são as de qualquer desafio deste programa.`
          : `We are giving you an ${desafioNome}, already active in your name and at no cost${fases && fases > 1 ? `. You are in ${faseTxt}` : ''}. The rules are the same as any challenge in this programme.`
        break
      case 'funded':
        assunto = pt ? `A tua conta Funded MTM${deTam} está activa` : `Your${deTam} MTM Funded account is active`
        cabecalho = pt ? 'A tua conta Funded está activa' : 'Your Funded account is active'
        frase = pt
          ? `A tua conta Funded MTM${deTam} está activa. Já não é uma prova: não há objectivo a atingir nem fase a passar. É negociação de capital patrocinado MTM — 75% dos resultados são teus.`
          : `Your${deTam} MTM Funded account is active. It is no longer a test: there is no target to hit and no phase to pass. It is trading of MTM-sponsored capital — 75% of the results are yours.`
        break
      case 'real':
        assunto = pt ? `A tua conta Real${deTam} está activa` : `Your${deTam} Real account is active`
        cabecalho = pt ? 'A tua conta Real está activa' : 'Your Real account is active'
        frase = pt
          ? `A tua conta Real${deTam} está activa. Não é um desafio nem uma simulação: não há objectivo a atingir nem fase a passar, e contém negociação real.`
          : `Your${deTam} Real account is active. It is not a challenge and not a simulation: there is no target to hit and no phase to pass, and it contains real trading.`
        break
      case 'auditoria':
        assunto = pt ? `A conta de auditoria${deTam} está pronta` : `The${deTam} audit account is ready`
        cabecalho = pt ? 'Conta de auditoria pronta' : 'Audit account ready'
        frase = pt
          ? `Esta conta de auditoria${deTam} está pronta. Negoceia a sério, não tem regras de programa e serve para a casa medir as estratégias.`
          : `This${deTam} audit account is ready. It trades for real, has no programme rules, and exists for the house to measure the strategies.`
        break
      case 'encerrada':
        assunto = pt ? `Os dados da tua conta ${produtoCurto}` : `The details of your ${produtoCurto}`
        cabecalho = pt ? 'Conta encerrada' : 'Account closed'
        frase = pt
          ? 'Esta conta está encerrada e já não negoceia. Os dados de acesso ficam aqui para consultares o histórico.'
          : 'This account is closed and no longer trades. The access details are here so you can review the history.'
        break
      case 'analise':
        assunto = pt ? `A tua conta de análise MTM Funded${paren} está pronta` : `Your MTM Funded analysis account${paren} is ready`
        cabecalho = pt ? 'A tua conta de análise está pronta' : 'Your analysis account is ready'
        frase = pt
          ? `A tua conta de análise MTM Funded${deTam} está pronta. É uma conta simulada, sem objectivo nem regras de avaliação, para acompanhares estratégias e negociares sem pressão.`
          : `Your${deTam} MTM Funded analysis account is ready. It is a simulated account with no target and no evaluation rules, for following strategies and trading without pressure.`
        break
      case 'torneio':
        assunto = pt ? `A tua conta do ${torneio} está pronta${paren}` : `Your ${torneio} account is ready${paren}`
        cabecalho = pt ? 'A tua conta de torneio está pronta' : 'Your tournament account is ready'
        frase = pt
          ? `Estás inscrito no ${torneio}. A tua conta de torneio${deTam} está pronta — conta a tua posição na classificação, dentro das regras.`
          : `You are registered for ${torneio}. Your${deTam} tournament account is ready — what counts is your position in the ranking, within the rules.`
        break
      default:
        assunto = pt ? `A ${produtoCurto} está pronta` : `The ${produtoCurto} is ready`
        cabecalho = pt ? 'Conta-mestre pronta' : 'Master account ready'
        frase = pt ? 'Esta conta-mestre de estratégia está pronta. Os dados de acesso estão aqui.' : 'This strategy master account is ready. The access details are here.'
    }
  } else if (motivo === 'regeneracao') {
    assunto = pt ? `As passwords da tua conta ${tipo === 'desafio' || tipo === 'oferta' ? `do ${produtoCurto}` : produtoCurto} mudaram` : `The passwords of ${aTuaConta} changed`
    cabecalho = pt ? 'Passwords novas' : 'New passwords'
    frase = pt
      ? 'As passwords desta conta foram geradas de novo. As antigas deixaram de funcionar. Se não foste tu nem o suporte, responde a este email.'
      : 'The passwords for this account were generated again. The old ones no longer work. If it was not you or support, reply to this email.'
  } else if (motivo === 'pedido') {
    assunto = pt ? `O link para veres as credenciais — ${capital(aTuaConta)}` : `The link to view your credentials — ${capital(aTuaConta)}`
    cabecalho = pt ? 'O teu link seguro' : 'Your secure link'
    frase = pt ? 'Pediste para ver as credenciais desta conta. O link abaixo abre-as uma vez.' : 'You asked to view this account\'s credentials. The link below opens them once.'
  } else {
    assunto = pt ? `Os dados de acesso — ${capital(aTuaConta)}` : `Access details — ${capital(aTuaConta)}`
    cabecalho = pt ? 'Os dados da tua conta' : 'Your account details'
    frase = pt
      ? `Aqui ficam os dados de acesso ${tipo === 'desafio' || tipo === 'oferta' ? `do ${produtoCurto}` : `da tua conta ${produtoCurto}`}, para os teres sempre à mão.`
      : `Here are the access details for ${aTuaConta}, so you always have them at hand.`
  }

  // ── linhas da tabela ──
  const linhas: Array<[string, string]> = [[pt ? 'Tipo de conta' : 'Account type', rotulo]]
  if (longo) linhas.push([pt ? 'Tamanho da conta' : 'Account size', longo])
  if (tipo === 'desafio' || tipo === 'oferta') {
    // O programa diz-se pelo que é (tamanho + fases), não pelo nome gravado — que numa conta Funded
    // chegou a ser «1K · 1 fase» e fazia a conta parecer um desafio.
    linhas.push([pt ? 'Programa' : 'Programme', desafioNome])
  }
  if (tipo === 'torneio') linhas.push([pt ? 'Torneio' : 'Tournament', torneio])

  /**
   * O aviso do rodapé. São TRÊS casos, não dois: dizer «conta simulada educativa» numa conta
   * encerrada que negociou a sério é falso, e dizer-lhe «contém negociação real» é um convite a
   * negociar nela. `real` = tem negociação real (o mesmo critério de aviso-conta::avisoReal).
   */
  const real = tipo === 'funded' || tipo === 'real' || tipo === 'auditoria'
  const aviso = tipo === 'encerrada'
    ? (pt
      ? 'Esta conta está encerrada e já não negoceia. Trading envolve risco de perda; resultados passados não garantem resultados futuros.'
      : 'This account is closed and no longer trades. Trading involves risk of loss; past results do not guarantee future results.')
    : tipo === 'auditoria'
      ? (pt
        ? 'Conta de auditoria da MoreThanMoney: contém negociação real, sem regras de programa, e serve para medir as estratégias. Trading envolve risco de perda; resultados passados não garantem resultados futuros.'
        : 'MoreThanMoney audit account: contains real trading, with no programme rules, used to measure the strategies. Trading involves risk of loss; past results do not guarantee future results.')
      : tipo === 'real'
        ? (pt
          ? 'Conta Real: contém negociação real. Trading envolve risco de perda; resultados passados não garantem resultados futuros.'
          : 'Real account: contains real trading. Trading involves risk of loss; past results do not guarantee future results.')
        : real
          ? (pt
            ? 'Conta Funded MTM: contém negociação real de capital patrocinado MTM (o Fundo MTM afecta à conta capital real correspondente a 10% do valor nominal). Trading envolve risco de perda; resultados passados não garantem resultados futuros.'
            : 'MTM Funded account: contains real trading of MTM-sponsored capital (the MTM Fund allocates real capital equal to 10% of the nominal value). Trading involves risk of loss; past results do not guarantee future results.')
          : (pt
            ? 'Conta simulada educativa: a negociação não é real. Resultados passados não garantem resultados futuros.'
            : 'Educational simulated account: trading is not real. Past results do not guarantee future results.')

  const subtitulo = tipo === 'desafio' || tipo === 'oferta'
    ? `F${fase} · ${desafioNome}`
    : `${rotulo}${K ? ` · ${K}` : ''}`

  const rotulos: TextosEntrega['rotulos'] = pt ? {
    ola: (n) => `Olá ${n},`,
    login: 'Login', servidor: 'Servidor', dadosAcesso: 'Dados de acesso',
    semPassword: (e) => `<strong>As passwords não vão por email.</strong> O botão abaixo mostra-as <strong>uma vez</strong>, dentro da app, depois de entrares na tua conta MTM. O link é só teu, vale até <strong>${e}</strong> e deixa de funcionar depois de aberto. Na tua área podes pedir outro ou gerar uma password nova.`,
    semPasswordTexto: (e) => `As passwords não vão por email. Abre este link (uma vez, só tu, até ${e}):`,
    verCredenciais: 'Ver credenciais', abrirWebtrader: 'Abrir o WebTrader',
    nuncaPedimos: 'A MoreThanMoney nunca te pede a password por email, telefone ou mensagem.',
    locale: 'pt-PT',
  } : {
    ola: (n) => `Hi ${n},`,
    login: 'Login', servidor: 'Server', dadosAcesso: 'Access details',
    semPassword: (e) => `<strong>Passwords are never sent by email.</strong> The button below shows them <strong>once</strong>, inside the app, after you sign in to your MTM account. The link is yours only, valid until <strong>${e}</strong>, and stops working once opened. You can request another one or generate a new password in your area.`,
    semPasswordTexto: (e) => `Passwords are never sent by email. Open this link (once, only you, until ${e}):`,
    verCredenciais: 'View credentials', abrirWebtrader: 'Open the WebTrader',
    nuncaPedimos: 'MoreThanMoney will never ask for your password by email, phone or message.',
    locale: 'en-GB',
  }

  return { tipo, assunto, cabecalho, subtitulo, frase, linhas, aviso, real, rotulos }
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
