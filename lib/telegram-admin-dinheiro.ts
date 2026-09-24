/**
 * DEPÓSITOS E LEVANTAMENTOS NO TELEMÓVEL — ver o pedido, ver a prova, decidir.
 *
 * Pedido do dono a 24/09: «a validação de depósitos na plataforma e nas contas reais que o cliente
 * queira criar ou depositar e levantar pode passar pelo bot de telegram ligado ao admin».
 *
 * ── O QUE ISTO É, E O QUE NÃO É ───────────────────────────────────────────────────────────────
 *
 * Validar um depósito é dizer «sim, esta pessoa depositou» e abrir-lhe o acesso: muda um REGISTO
 * NOSSO. Aprovar um levantamento é dizer «sim, este valor é devido»: muda o estado de um pedido.
 * O dinheiro em si nunca passa por aqui — quem transfere é a corretora, com as mãos do dono, num
 * sítio onde este bot não entra. Se algum dia um botão daqui parecer estar a pagar alguma coisa, é
 * porque o desenho se partiu.
 *
 * ── O ZERO QUE FECHOU A ROTA DURANTE DOIS MESES ───────────────────────────────────────────────
 *
 * `broker_clients.deposits_usd` está a zero em quase toda a tabela porque a coluna nunca foi
 * mapeada no importador (ver `lib/broker/dados-corretora.ts`). Um bot que leia esse zero e diga
 * «não atingiu o mínimo» está a repetir, num ecrã de decisão, o erro que já custou dois meses de
 * funil fechado. Por isso `lerDeposito` distingue TRÊS coisas que se parecem:
 *
 *   · confirmado      — a corretora diz um valor e ele chega;
 *   · abaixo          — a corretora diz um valor e ele não chega;
 *   · não sei         — não há valor, ou o valor é zero em dados velhos, ou o UID nem consta.
 *
 * No terceiro caso o bot não decide: mostra a prova e diz porque não sabe. Um «não sei» honesto
 * vale mais do que um «não» calculado sobre um campo que nunca foi preenchido.
 *
 *   npx tsx lib/__tests__/telegram-admin-dinheiro.check.ts
 */
import { avaliarFrescura, type EstadoFrescura } from '@/lib/broker/dados-corretora'
import { bloqueioDeLevantamento, guardaLevantamento } from '@/lib/mtmfunded/admin-conta'
import { almofadaUsd, levantavelUsd, QUOTA_TRADER } from '@/lib/mtmfunded/contrato'
import { escaparHtml as esc, comRegisto, pedirConfirmacao, type Botao, type Confirmacao, type Porta } from '@/lib/telegram-admin-porta'

// ═══════════════════════════ DEPÓSITOS ═══════════════════════════

export type CertezaDeDeposito = 'confirmado' | 'abaixo' | 'nao_sei'

export interface LeituraDeDeposito {
  certeza: CertezaDeDeposito
  /** O que a corretora diz. `null` quando não diz nada — e `null` não é `0`. */
  valorUsd: number | null
  /** A frase que o bot escreve, já com a razão da incerteza quando existe. */
  frase: string
  /** Só quando a corretora confirma. Uma aprovação por print é sempre decisão do dono. */
  automatico: boolean
}

export interface DadosDoDeposito {
  uid: string | null
  /** A linha da corretora para este UID, ou `null` se o UID não consta da lista importada. */
  corretora: { deposits_usd?: number | null; balance_usd?: number | null } | null
  /** A frescura do export inteiro (a mais recente `updated_at` de `broker_clients`). */
  frescura: EstadoFrescura
  diasDosDados: number | null
  minimoUsd: number
}

/**
 * Pura: o que é que sabemos sobre o depósito desta pessoa?
 *
 * A ordem das perguntas importa. Primeiro «há UID?», depois «o UID consta?», depois «há valor?»,
 * e só no fim «o valor chega?». Saltar um degrau é como se chega a um «não» sobre um campo vazio.
 */
export function lerDeposito(d: DadosDoDeposito): LeituraDeDeposito {
  const naoSei = (frase: string): LeituraDeDeposito => ({ certeza: 'nao_sei', valorUsd: null, frase, automatico: false })

  if (!d.uid) return naoSei('A pessoa nunca deu UID — não há nada para confirmar na corretora.')
  if (!d.corretora) {
    return naoSei(
      `O UID <code>${esc(d.uid)}</code> não consta da lista importada da corretora` +
        (d.frescura === 'sem_dados'
          ? ' — e essa lista nunca foi importada.'
          : d.diasDosDados != null
            ? ` (o export tem ${d.diasDosDados} dias).`
            : '.'),
    )
  }

  const bruto = d.corretora.deposits_usd
  if (bruto == null) {
    return naoSei('A corretora tem esta conta mas não trouxe o valor do depósito. <b>Não é zero — é desconhecido.</b>')
  }

  const valor = Number(bruto)
  if (!Number.isFinite(valor)) return naoSei('O valor do depósito veio ilegível do export da corretora.')

  /*
   * Zero é o valor suspeito. Foi assim que 58 dos 59 clientes ficaram bloqueados: a coluna não
   * estava mapeada e o importador antigo escrevia zeros, que se leem como dados. Um zero num
   * export velho não decide nada; num export fresco, decide.
   */
  if (valor === 0 && d.frescura !== 'fresco') {
    return naoSei(
      'A corretora diz <b>0 USD</b> de depósito, mas estes dados ' +
        (d.frescura === 'sem_dados' ? 'nunca foram importados' : `têm ${d.diasDosDados ?? '?'} dias`) +
        ' — e a coluna dos depósitos já esteve por mapear. Importa um export novo antes de decidir por este zero.',
    )
  }

  if (valor + 1e-9 >= d.minimoUsd) {
    return {
      certeza: 'confirmado',
      valorUsd: valor,
      frase: `A corretora confirma <b>${valor} USD</b> depositados (mínimo ${d.minimoUsd} USD).`,
      automatico: true,
    }
  }
  return {
    certeza: 'abaixo',
    valorUsd: valor,
    frase: `A corretora diz <b>${valor} USD</b> — abaixo do mínimo de ${d.minimoUsd} USD.`,
    automatico: false,
  }
}

/** Pura: os botões de um pedido de depósito à espera de decisão. */
export function tecladoDeposito(chatIdLead: string, voltar: Botao[]): { inline_keyboard: Botao[][] } {
  return {
    inline_keyboard: [
      [
        { text: '✅ Aprovar', callback_data: `admin:dep?ok:${chatIdLead}` },
        { text: '❌ Recusar', callback_data: `admin:dep?no:${chatIdLead}` },
      ],
      [{ text: '🔎 A folha desta pessoa', callback_data: `admin:quem:${chatIdLead}` }],
      voltar,
    ],
  }
}

/** Pura: a pergunta antes de decidir um depósito. */
export function confirmacaoDeposito(p: {
  aprovar: boolean
  chatIdLead: string
  nome: string
  leitura: LeituraDeDeposito
}): Confirmacao {
  return pedirConfirmacao({
    titulo: p.aprovar ? `Aprovar o acesso de ${p.nome}` : `Recusar o pedido de ${p.nome}`,
    vaiAcontecer: p.aprovar
      ? [
          'Liberta os convites pessoais dos grupos de sinais.',
          'Emite o cupão Premium (e o do MTM Auto, se foi por aí que entrou).',
          'Marca o lead como «acesso libertado» e fica registado em teu nome.',
        ]
      : [
          'A pessoa recebe uma mensagem a dizer que não consegui confirmar o depósito, e o convite a reenviar o print.',
          'O lead fica marcado como recusado. Pode voltar a enviar prova.',
        ],
    naoVaiAcontecer: [
      'Não mexe em dinheiro nenhum: nem transfere, nem devolve, nem toca na conta da corretora.',
    ],
    fazer: `admin:dep!${p.aprovar ? 'ok' : 'no'}:${p.chatIdLead}`,
    voltar: 'admin:dep',
    rotuloSim: p.aprovar ? '✅ Sim, libertar acesso' : '❌ Sim, recusar',
  })
}

/**
 * Aprova o acesso deste lead — pela MESMA porta do gate (`grantBrokerAccess`).
 *
 * Aprovar pelo painel e aprovar pela foto têm de fazer exactamente a mesma coisa; se um dia
 * divergirem, há pessoas com meio acesso e ninguém sabe qual dos dois caminhos as criou.
 */
export async function aprovarDeposito(supabase: unknown, porta: Porta, chatIdLead: string): Promise<string> {
  const db = supabase as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: antes } = await db.from('telegram_leads').select('chat_id, stage, broker_uid, coupon_code, first_name').eq('chat_id', chatIdLead).maybeSingle()
  if (!antes) return '🤷 Não encontrei esse lead.'

  const r = await comRegisto(
    porta,
    { acao: 'deposito_aprovar', alvo: `lead:${chatIdLead}`, pedido: { chatIdLead }, antes },
    async () => {
      const { grantBrokerAccess } = await import('@/lib/telegram-broker-gate')
      await grantBrokerAccess(supabase as never, chatIdLead)
      const { data: depois } = await db.from('telegram_leads').select('stage, coupon_code, granted_at').eq('chat_id', chatIdLead).maybeSingle()
      const ok = (depois as { stage?: string } | null)?.stage === 'granted'
      return {
        ok,
        depois,
        texto: ok
          ? `✅ <b>Acesso libertado</b> a ${esc(String((antes as { first_name?: string }).first_name ?? chatIdLead))}.\n\nConvites e cupão já lhe foram enviados.`
          : '⚠️ Corri a libertação mas o lead não ficou como «granted». Confirma em /admin/social.',
      }
    },
  )
  return r.texto
}

/** Recusa o pedido, com o motivo escrito — e o motivo vai para a mensagem da pessoa e para o registo. */
export async function recusarDeposito(supabase: unknown, porta: Porta, chatIdLead: string): Promise<string> {
  const db = supabase as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: antes } = await db.from('telegram_leads').select('chat_id, stage, broker_uid, first_name').eq('chat_id', chatIdLead).maybeSingle()
  if (!antes) return '🤷 Não encontrei esse lead.'

  const r = await comRegisto(
    porta,
    { acao: 'deposito_recusar', alvo: `lead:${chatIdLead}`, pedido: { chatIdLead }, antes },
    async () => {
      const { rejeitarPedidoDeAcesso } = await import('@/lib/telegram-broker-gate')
      await rejeitarPedidoDeAcesso(supabase as never, chatIdLead)
      return {
        ok: true,
        depois: { stage: 'rejected' },
        texto: `❌ <b>Recusado.</b> ${esc(String((antes as { first_name?: string }).first_name ?? chatIdLead))} foi avisado e pode reenviar a prova.`,
      }
    },
  )
  return r.texto
}

// ═══════════════════════════ LEVANTAMENTOS ═══════════════════════════

export interface PedidoDeLevantamento {
  id: string
  valorUsd: number
  estado: string
  uidBroker: string | null
  criadoEm: string | null
  conta: {
    id: string
    login: string | null
    tipo: string
    estado: string
    motor: string
    saldoInicial: number
    simSaldo: number | null
    equityMetricas: number | null
    metricas: unknown
  }
  jaPagoOutros: number
  abertas: number | null
  pendentes: number | null
}

/**
 * Os destinos, em UMA LETRA.
 *
 * O `callback_data` do Telegram tem 64 BYTES, e não mais: um uuid gasta 36 e o prefixo `admin:`
 * outros 6. Escrever «em_analise» por extenso deixava 8 bytes para tudo o resto, e o botão do
 * motivo da recusa não cabia — um botão que não cabe é um botão que o Telegram rejeita em silêncio.
 * O teste tranca o tamanho de todos os botões gerados aqui.
 */
export const DESTINOS: Record<string, VeredictoLevantamento['para']> = {
  e: 'em_analise',
  a: 'aprovado',
  p: 'pago',
  r: 'recusado',
}
export const LETRA_DO_DESTINO: Record<VeredictoLevantamento['para'], string> = {
  em_analise: 'e', aprovado: 'a', pago: 'p', recusado: 'r',
}

/**
 * Os motivos de recusa, prontos a tocar.
 *
 * `guardaLevantamento` exige um motivo com pelo menos 3 caracteres — e tem razão: um levantamento
 * recusado sem motivo é um trader que não sabe o que corrigir. Num telemóvel não se escreve um
 * parágrafo, por isso os motivos que se repetem ficam em botões; o texto que sai é o mesmo que
 * fica no registo e o mesmo que a pessoa lê.
 */
export const MOTIVOS_DE_RECUSA: Record<string, string> = {
  b: 'Capital da casa: esta conta não levanta durante os 12 meses acordados.',
  p: 'Há posições abertas ou ordens pendentes na conta — fecha tudo e volta a pedir.',
  v: 'O valor pedido está acima do levantável (almofada de 3% e quota de 75%).',
  c: 'Falta o comprovativo do menu de depósito com o endereço e o valor visíveis.',
  o: 'Recusado pelo admin — falamos por mensagem.',
}

export interface VeredictoLevantamento {
  /** A transição que se está a avaliar. */
  para: 'em_analise' | 'aprovado' | 'pago' | 'recusado'
  pode: boolean
  /** Porque não — na língua em que se explica a um cliente, não em código. */
  porque: string | null
  /** A regra que trava, quando é uma regra com nome (bloqueio de 12 meses). */
  regra: string | null
}

/**
 * Pura: pode este pedido passar a `para`?
 *
 * Chama a MESMA `guardaLevantamento` do /admin — não há aqui uma segunda opinião. O que isto
 * acrescenta é dizer a regra em voz alta quando o que trava é o bloqueio de 12 meses do capital da
 * casa: recusar em silêncio é a forma mais rápida de um trader achar que lhe roubaram o lucro.
 */
export function avaliarLevantamento(
  p: PedidoDeLevantamento,
  para: VeredictoLevantamento['para'],
  motivo?: string,
  agoraMs: number = Date.now(),
): VeredictoLevantamento {
  const preso = bloqueioDeLevantamento(p.conta.metricas, agoraMs)
  const erro = guardaLevantamento({
    conta: {
      tipo: p.conta.tipo,
      estado: p.conta.estado,
      motor: p.conta.motor,
      saldo_inicial: p.conta.saldoInicial,
      sim_saldo: p.conta.simSaldo,
      equityMetricas: p.conta.equityMetricas,
      metricas: p.conta.metricas,
    },
    abertas: p.abertas,
    pendentes: p.pendentes,
    jaPagoOutros: p.jaPagoOutros,
    valor: p.valorUsd,
    estadoAtual: p.estado,
    novoEstado: para,
    motivo,
    agoraMs,
  })
  return {
    para,
    pode: erro == null,
    porque: erro,
    regra: preso && para !== 'recusado'
      ? `Capital da casa: esta conta não levanta até ${new Date(preso).toLocaleDateString('pt-PT')} (12 meses). É a condição com que o capital foi dado — diz-lhe isso, não recuses em silêncio.`
      : null,
  }
}

/** Pura: o resumo de um pedido, com as contas todas à vista. */
export function textoLevantamento(p: PedidoDeLevantamento, agoraMs: number = Date.now()): string {
  const equity = p.conta.motor === 'sim' && p.conta.simSaldo != null ? p.conta.simSaldo : p.conta.equityMetricas ?? p.conta.saldoInicial
  const disponivel = levantavelUsd(p.conta.saldoInicial, equity, p.jaPagoOutros)
  const preso = bloqueioDeLevantamento(p.conta.metricas, agoraMs)
  const nf = (n: number) => new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 }).format(n)

  return [
    `🏧 <b>Levantamento — ${nf(p.valorUsd)} USD</b>`,
    `Estado: <b>${esc(p.estado)}</b>${p.criadoEm ? ` · pedido a ${new Date(p.criadoEm).toLocaleDateString('pt-PT')}` : ''}`,
    '',
    `Conta <code>${esc(p.conta.login ?? p.conta.id.slice(0, 8))}</code> · ${esc(p.conta.tipo)} · ${esc(p.conta.estado)}`,
    `Saldo inicial ${nf(p.conta.saldoInicial)} · equidade ${nf(equity)}`,
    `Almofada de 3%: ${nf(almofadaUsd(p.conta.saldoInicial))} · quota do trader ${Math.round(QUOTA_TRADER * 100)}%`,
    `Já pago nesta conta: ${nf(p.jaPagoOutros)}`,
    `<b>Levantável agora: ${nf(disponivel)} USD</b>`,
    p.abertas == null || p.pendentes == null
      ? '\n⚠️ Não consegui confirmar as posições abertas desta conta — na dúvida não se paga.'
      : p.abertas || p.pendentes
        ? `\n⚠️ ${p.abertas} posição(ões) aberta(s) e ${p.pendentes} ordem(ns) pendente(s): fecha antes de aprovar.`
        : '',
    preso
      ? `\n🔒 <b>Capital da casa</b> — não levanta até ${new Date(preso).toLocaleDateString('pt-PT')} (12 meses). Recusa com este motivo.`
      : '',
    p.uidBroker ? `\nPaga-se como depósito na PU Prime, UID <code>${esc(p.uidBroker)}</code> (USDC/Solana). <b>Fazes tu, na corretora.</b>` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Pura: os botões de decisão de um levantamento, só com as transições que fazem sentido agora. */
export function tecladoLevantamento(p: PedidoDeLevantamento, voltar: Botao[]): { inline_keyboard: Botao[][] } {
  const linhas: Botao[][] = []
  if (p.estado === 'pedido') linhas.push([{ text: '🔍 Pôr em análise', callback_data: `admin:lv?e:${p.id}` }])
  if (['pedido', 'em_analise'].includes(p.estado)) {
    linhas.push([{ text: '✅ Aprovar', callback_data: `admin:lv?a:${p.id}` }])
  }
  if (p.estado === 'aprovado') linhas.push([{ text: '💸 Marcar como pago', callback_data: `admin:lv?p:${p.id}` }])
  if (!['pago', 'recusado'].includes(p.estado)) {
    linhas.push([{ text: '❌ Recusar', callback_data: `admin:lv?r:${p.id}` }])
  }
  linhas.push([{ text: '🌐 Abrir no /admin', url: `${process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.morethanmoney.pt'}/admin?tab=mtmfunded` }])
  linhas.push(voltar)
  return { inline_keyboard: linhas }
}

/** Pura: a pergunta antes de mexer num levantamento. */
export function confirmacaoLevantamento(p: PedidoDeLevantamento, para: VeredictoLevantamento['para']): Confirmacao {
  const nf = (n: number) => new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 }).format(n)
  const oQue: Record<VeredictoLevantamento['para'], string[]> = {
    em_analise: ['O pedido passa a «em análise». A pessoa vê que está a ser tratado.'],
    aprovado: [
      `O pedido de ${nf(p.valorUsd)} USD fica <b>aprovado</b> — é o compromisso de pagar.`,
      'Depois de aprovado, o valor deixa de contar como levantável.',
    ],
    pago: [
      `O pedido de ${nf(p.valorUsd)} USD fica <b>pago</b>.`,
      'A conta Funded é fechada e substituída por uma igual (ciclo de vida).',
    ],
    recusado: ['O pedido fica recusado, com o motivo, e o valor volta a ficar levantável.'],
  }
  /*
   * Recusar precisa de um motivo, e o motivo É a confirmação: escolher «porquê» é o segundo toque,
   * e não há caminho que recuse sem ele. Aprovar e pagar levam a pergunta normal.
   */
  if (para === 'recusado') {
    return {
      texto:
        `❌ <b>Recusar ${nf(p.valorUsd)} USD</b>\n\n` +
        'Escolhe o motivo — é o que vai ficar registado <b>e</b> o que a pessoa vai ler.\n\n' +
        '🚫 Não mexe em dinheiro nenhum.',
      teclado: {
        inline_keyboard: [
          ...Object.entries(MOTIVOS_DE_RECUSA).map(([k, texto]) => [
            { text: texto.length > 42 ? `${texto.slice(0, 41)}…` : texto, callback_data: `admin:lv!r:${p.id}:${k}` },
          ]),
          [{ text: '↩️ Não, voltar', callback_data: 'admin:lev' }],
        ],
      },
    }
  }
  return pedirConfirmacao({
    titulo: `Levantamento ${nf(p.valorUsd)} USD → ${para.replace('_', ' ')}`,
    vaiAcontecer: oQue[para],
    naoVaiAcontecer: [
      'Não transfere dinheiro nenhum. O pagamento é feito por ti, na corretora, como depósito na conta do trader.',
    ],
    fazer: `admin:lv!${LETRA_DO_DESTINO[para]}:${p.id}`,
    voltar: 'admin:lev',
    rotuloSim: '✅ Sim, confirmo',
  })
}

/**
 * Aplica a decisão — pelo MESMO executor auditado do /admin.
 *
 * Nada de `update` directo à tabela: `executarComAuditoria` escreve a intenção antes, corre a
 * acção `levantamento` (que volta a verificar as guardas com os números frescos) e fecha o registo
 * com o antes e o depois. O bot só acrescenta a chave de idempotência e o motivo.
 */
export async function aplicarLevantamento(
  porta: Porta,
  levantamentoId: string,
  para: VeredictoLevantamento['para'],
  motivo: string,
): Promise<string> {
  const { getSupabaseAdmin } = await import('@/lib/supabase-admin-client')
  const db = getSupabaseAdmin()
  const { data: pedido } = await db
    .from('mtm_funded_withdrawals')
    .select('id, account_id, valor_usd, estado')
    .eq('id', levantamentoId)
    .maybeSingle()
  if (!pedido) return '🤷 Não encontrei esse pedido de levantamento.'

  const { executarComAuditoria, lerContaFunded } = await import('@/lib/mtmfunded/admin-conta-executar')
  const conta = await lerContaFunded(String((pedido as { account_id: string }).account_id))
  if (!conta) return '🤷 O pedido aponta para uma conta que já não existe.'

  const r = await executarComAuditoria({
    adminId: porta.adminId,
    adminEmail: porta.adminEmail,
    conta,
    pedido: { accao: 'levantamento', levantamentoId, estado: para, motivo },
    // Chave estável por (pedido, destino): um duplo toque no telemóvel não paga duas vezes.
    chave: `tg-lev-${levantamentoId.replace(/-/g, '').slice(0, 24)}-${para}`,
  })

  if (r.status >= 400) return `⚠️ Não fiz: ${esc(String((r.resposta as { error?: string }).error ?? 'erro'))}`
  if (r.repetido) return '✅ Já estava feito — esta decisão já tinha sido tomada (não repeti nada).'
  const renov = (r.resposta as { renovacao?: { contaNova?: string } | null }).renovacao
  return (
    `✅ <b>Levantamento ${esc(para.replace('_', ' '))}.</b>` +
    (renov?.contaNova ? `\n\nA conta foi renovada: nova conta <code>${esc(renov.contaNova.slice(0, 8))}</code>.` : '') +
    (para === 'aprovado' || para === 'pago'
      ? '\n\n<i>O pagamento em si fazes tu na corretora — isto só registou a decisão.</i>'
      : '')
  )
}

/** Avalia a frescura dos dados da corretora a partir da linha mais recente. Reexporta para o painel. */
export { avaliarFrescura }

// ═══════════════════════════ AS LEITURAS ═══════════════════════════

/* eslint-disable @typescript-eslint/no-explicit-any */
type Supa = { from: (t: string) => any }

export interface PedidoDeDeposito {
  chatId: string
  nome: string
  uid: string | null
  /** O print que a pessoa enviou, para se poder ver a prova sem sair do bot. */
  fotoId: string | null
  desdeIso: string | null
  leitura: LeituraDeDeposito
}

/**
 * A fila dos pedidos de acesso à espera de decisão, cada um já com o que a corretora diz.
 *
 * Lê-se a lista da corretora de uma vez e cruza-se em memória: são dezenas de linhas, e uma
 * consulta por pedido dentro de um webhook de Telegram é a forma garantida de o ecrã demorar.
 */
export async function carregarPendentesDeDeposito(supabase: unknown, quantos = 10): Promise<PedidoDeDeposito[]> {
  const db = supabase as Supa
  const { MIN_DEPOSIT } = await import('@/lib/telegram-broker-gate')

  const [{ data: leads }, { data: clientes }] = await Promise.all([
    db.from('telegram_leads').select('chat_id, first_name, broker_uid, proof_file_id, updated_at').eq('stage', 'pending_review').limit(quantos),
    db.from('broker_clients').select('uid, deposits_usd, balance_usd, updated_at').limit(2000),
  ])

  const linhas = (clientes ?? []) as Array<{ uid: string; deposits_usd: number | null; balance_usd: number | null; updated_at?: string | null }>
  const porUid = new Map(linhas.map((c) => [String(c.uid), c]))
  const maisRecente = linhas.map((c) => c.updated_at ?? '').sort().at(-1) || null
  const f = avaliarFrescura(maisRecente)

  return ((leads ?? []) as Array<Record<string, unknown>>).map((l) => {
    const uid = (l.broker_uid as string) ?? null
    return {
      chatId: String(l.chat_id),
      nome: (l.first_name as string)?.trim() || String(l.chat_id),
      uid,
      fotoId: (l.proof_file_id as string) ?? null,
      desdeIso: (l.updated_at as string) ?? null,
      leitura: lerDeposito({
        uid,
        corretora: uid ? porUid.get(uid) ?? null : null,
        frescura: f.estado,
        diasDosDados: f.dias,
        minimoUsd: MIN_DEPOSIT,
      }),
    }
  })
}

/** Pura: o resumo de um pedido de depósito. */
export function textoDeposito(p: PedidoDeDeposito): string {
  const emoji = p.leitura.certeza === 'confirmado' ? '✅' : p.leitura.certeza === 'abaixo' ? '⚠️' : '❓'
  return [
    `${emoji} <b>${esc(p.nome)}</b>`,
    p.uid ? `UID <code>${esc(p.uid)}</code>` : 'sem UID',
    p.desdeIso ? `à espera desde ${new Date(p.desdeIso).toLocaleDateString('pt-PT')}` : '',
    '',
    p.leitura.frase,
    p.leitura.certeza === 'nao_sei' ? '\n<i>Decide pelo print — eu não tenho como confirmar isto sozinho.</i>' : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Lê um pedido de levantamento com tudo o que a decisão precisa — incluindo as posições abertas. */
export async function carregarPedidoDeLevantamento(supabase: unknown, id: string): Promise<PedidoDeLevantamento | null> {
  const db = supabase as Supa
  const { data: p } = await db
    .from('mtm_funded_withdrawals')
    .select('id, account_id, valor_usd, estado, uid_broker, criado_em')
    .eq('id', id)
    .maybeSingle()
  if (!p) return null

  const { data: conta } = await db
    .from('mtm_trading_accounts')
    .select('id, mt5_login, tipo, estado, motor, saldo_inicial, sim_saldo, metricas, metaapi_account_id')
    .eq('id', (p as { account_id: string }).account_id)
    .maybeSingle()
  if (!conta) return null

  const c = conta as Record<string, unknown>
  const { data: outros } = await db
    .from('mtm_funded_withdrawals')
    .select('valor_usd')
    .eq('account_id', c.id)
    .in('estado', ['pago', 'aprovado'])
    .neq('id', id)

  /*
   * As posições contam-se com as MESMAS funções do /admin. Quando a conta vive na corretora e a
   * MetaApi não responde, fica `null` — e `null` trava a aprovação: na dúvida não se paga.
   */
  let abertas: number | null = 0
  let pendentes: number | null = 0
  if (c.motor === 'sim') {
    const { contarAbertas } = await import('@/lib/mtmfunded/admin-conta-accoes')
    const r = await contarAbertas(db as never, String(c.id))
    abertas = r.abertas
    pendentes = r.pendentes
  } else if (c.metaapi_account_id) {
    const { readOpenPositions } = await import('@/lib/mtmcopy/metaapi')
    const pos = await readOpenPositions(String(c.metaapi_account_id)).catch(() => null)
    abertas = pos == null ? null : pos.length
    pendentes = pos == null ? null : 0
  }

  const m = (c.metricas ?? {}) as Record<string, unknown>
  const x = p as Record<string, unknown>
  return {
    id: String(x.id),
    valorUsd: Number(x.valor_usd ?? 0),
    estado: String(x.estado ?? 'pedido'),
    uidBroker: (x.uid_broker as string) ?? null,
    criadoEm: (x.criado_em as string) ?? null,
    conta: {
      id: String(c.id),
      login: (c.mt5_login as string) ?? null,
      tipo: String(c.tipo ?? ''),
      estado: String(c.estado ?? ''),
      motor: String(c.motor ?? 'mt5'),
      saldoInicial: Number(c.saldo_inicial ?? 0),
      simSaldo: c.sim_saldo == null ? null : Number(c.sim_saldo),
      equityMetricas: typeof m.equity === 'number' ? m.equity : null,
      metricas: m,
    },
    jaPagoOutros: ((outros ?? []) as Array<{ valor_usd: number }>).reduce((t, o) => t + Number(o.valor_usd ?? 0), 0),
    abertas,
    pendentes,
  }
}

/** A fila dos levantamentos por decidir — só os ids e o essencial, para a lista. */
export async function carregarLevantamentosAbertos(
  supabase: unknown,
  quantos = 10,
): Promise<Array<{ id: string; valorUsd: number; estado: string; criadoEm: string | null; quem: string }>> {
  const db = supabase as Supa
  const { data } = await db
    .from('mtm_funded_withdrawals')
    .select('id, user_id, valor_usd, estado, criado_em')
    .in('estado', ['pedido', 'em_analise', 'aprovado'])
    .order('criado_em', { ascending: true })
    .limit(quantos)

  const linhas = (data ?? []) as Array<Record<string, unknown>>
  const ids = [...new Set(linhas.map((l) => String(l.user_id)).filter(Boolean))]
  const nomes = new Map<string, string>()
  if (ids.length) {
    const { data: perfis } = await db.from('profiles').select('id, full_name, email').in('id', ids)
    for (const p of (perfis ?? []) as Array<{ id: string; full_name?: string; email?: string }>) {
      nomes.set(String(p.id), p.full_name?.trim() || p.email || String(p.id).slice(0, 8))
    }
  }
  return linhas.map((l) => ({
    id: String(l.id),
    valorUsd: Number(l.valor_usd ?? 0),
    estado: String(l.estado ?? ''),
    criadoEm: (l.criado_em as string) ?? null,
    quem: nomes.get(String(l.user_id)) ?? 'sem nome',
  }))
}
