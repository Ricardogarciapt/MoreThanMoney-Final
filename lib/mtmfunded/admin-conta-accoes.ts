import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type PedidoAccao, transicao, podeAvancarFase, guardaLevantamento,
} from './admin-conta'

/**
 * AS ACÇÕES DO ADMIN SOBRE UMA CONTA — o lado que escreve.
 *
 * A rota valida (zod, em ./admin-conta), audita e responde; isto executa. O `db` entra por
 * parâmetro para o teste poder passar uma base de mentira e ver QUE escritas saem de cada acção
 * (o ajuste de saldo tem de ser um `rpc('funded_somar_saldo')`, nunca um `update` de sim_saldo).
 *
 * As posições e ordens passam pelas MESMAS funções do WebTrader (lib/mtmfunded/simulado/execucao):
 * fecho total por funded_fechar_posicao, parcial por funded_fechar_parcial, preço fresco, etc. Um
 * admin não tem um atalho que o trader não tenha — só tem o botão do lado de cá.
 */

export class ErroAdmin extends Error {
  constructor(public status: number, mensagem: string) { super(mensagem) }
}

export interface ContextoAccao {
  db: SupabaseClient
  adminId: string
  adminEmail?: string | null
  conta: Record<string, unknown> & { id: string; estado: string; motor: string; tipo: string }
  agora: string
  /** Quem manda o email do ajuste (o teste troca-o por um espião; por omissão, o SMTP da casa). */
  enviarEmail?: EnviarEmail
}

export type EnviarEmail = (para: string, mail: { subject: string; html: string; text: string }) => Promise<void>

const enviarPeloSmtp: EnviarEmail = async (para, mail) => {
  const { createMailTransporter, mailFrom, prepareBrandedEmailHtml, brandedMailAttachments } = await import('@/lib/mail-transport')
  const t = createMailTransporter()
  try {
    await t.sendMail({ from: mailFrom(), to: para, subject: mail.subject, html: prepareBrandedEmailHtml(mail.html), text: mail.text, attachments: brandedMailAttachments() })
  } finally {
    t.close?.()
  }
}

/**
 * O email de UMA linha do histórico de ajustes, ao dono da conta. Só é chamado por um pedido
 * explícito (caixa marcada no ajuste, ou botão na linha). Marca a linha com o estado do envio.
 */
export async function enviarEmailDoAjuste(ctx: Pick<ContextoAccao, 'db' | 'conta' | 'enviarEmail'>, ajusteId: string): Promise<'enviado' | 'falhou' | 'sem_email'> {
  const { db, conta } = ctx
  const { data: a } = await db.from('mtm_funded_ajustes_saldo')
    .select('id, account_id, delta, saldo_depois, referencia, observacao, estado, aplicado_em, criado_em')
    .eq('id', ajusteId).eq('account_id', conta.id).maybeSingle()
  if (!a) throw new ErroAdmin(404, 'ajuste não encontrado nesta conta')
  if (a.estado !== 'aplicado') throw new ErroAdmin(409, 'só se avisa o cliente de um ajuste aplicado')
  const { data: perfil } = conta.user_id
    ? await db.from('profiles').select('full_name, email').eq('id', String(conta.user_id)).maybeSingle()
    : { data: null }
  let estado: 'enviado' | 'falhou' | 'sem_email'
  if (!perfil?.email) estado = 'sem_email'
  else {
    const { construirEmailAjuste } = await import('./email-ajuste-saldo')
    const mail = construirEmailAjuste({
      nome: (perfil.full_name as string | null) ?? null, login: String(conta.mt5_login ?? '—'),
      delta: Number(a.delta), referencia: String(a.referencia), observacao: (a.observacao as string | null) ?? null,
      saldoNovo: Number(a.saldo_depois), em: new Date(String(a.aplicado_em ?? a.criado_em)),
    })
    try {
      await (ctx.enviarEmail ?? enviarPeloSmtp)(String(perfil.email), mail)
      estado = 'enviado'
    } catch (e) {
      console.error('[mtmfunded/admin] email do ajuste falhou:', e)
      estado = 'falhou'
    }
  }
  await db.from('mtm_funded_ajustes_saldo').update({
    email_estado: estado, ...(estado === 'enviado' ? { email_enviado_em: new Date().toISOString() } : {}),
  }).eq('id', ajusteId)
  return estado
}

/** Erros das funções SQL (raise exception) → status HTTP com a mensagem da base. */
function erroDaFuncao(e: { code?: string; message?: string } | null, oQue: string): never {
  const m = e?.message ?? 'falhou'
  if (/42883|PGRST202|function .* does not exist/i.test(`${e?.code} ${m}`)) throw new ErroAdmin(503, `${oQue}: a migração 197 ainda não foi aplicada`)
  if (e?.code === 'P0002') throw new ErroAdmin(404, m)
  if (e?.code === '22023' || e?.code === '23514' || e?.code === '40001') throw new ErroAdmin(409, m)
  throw new ErroAdmin(500, `${oQue}: ${m}`)
}

export interface ResultadoAccao {
  /** O que volta ao modal. Pode levar passwords (regenerar) — nunca vai para a auditoria. */
  resposta: Record<string, unknown>
  /** O que fica na auditoria. Sem isto, fica a resposta. */
  auditoria?: Record<string, unknown>
}

const semColuna = (e: { code?: string; message?: string } | null) =>
  Boolean(e && /42703|PGRST204|42883|PGRST202|column|function .* does not exist/i.test(`${e.code} ${e.message}`))

function falhaDeEscrita(e: { code?: string; message?: string } | null, oQue: string): never {
  if (semColuna(e)) throw new ErroAdmin(503, `${oQue}: a migração 079 ainda não foi aplicada`)
  throw new ErroAdmin(500, `${oQue}: ${e?.message ?? 'falhou'}`)
}

export async function contarAbertas(db: SupabaseClient, accountId: string): Promise<{ abertas: number; pendentes: number }> {
  const [{ count: abertas }, { count: pendentes }] = await Promise.all([
    db.from('funded_positions').select('id', { count: 'exact', head: true }).eq('account_id', accountId).eq('estado', 'aberta'),
    db.from('funded_orders').select('id', { count: 'exact', head: true }).eq('account_id', accountId).eq('estado', 'pendente'),
  ])
  return { abertas: abertas ?? 0, pendentes: pendentes ?? 0 }
}

function exigirSimulada(conta: ContextoAccao['conta'], oQue: string) {
  if (conta.motor !== 'sim') throw new ErroAdmin(409, `${oQue} só existe nas contas simuladas (esta vive na corretora)`)
}

/** A conta no formato de execucao.ts (lida de novo: o motor pode ter mexido desde que o modal abriu). */
async function contaDeExecucao(accountId: string) {
  const ex = await import('./simulado/execucao')
  const c = await ex.lerConta(accountId)
  if (!c || c.motor !== 'sim') throw new ErroAdmin(404, 'conta simulada não encontrada')
  return { ex, c }
}

/** Erros de execucao.ts (ErroOrdem) passam com o status deles. */
async function comoAdmin<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f()
  } catch (e) {
    const s = (e as { status?: number }).status
    if (e instanceof ErroAdmin) throw e
    if (typeof s === 'number') throw new ErroAdmin(s, (e as Error).message)
    throw e
  }
}

export async function executarAccao(ctx: ContextoAccao, p: PedidoAccao): Promise<ResultadoAccao> {
  const { db, conta, agora, adminId } = ctx
  const motivo = 'motivo' in p ? p.motivo ?? null : null

  switch (p.accao) {
    // ── posições & ordens ──────────────────────────────────────────────────
    case 'fechar_posicao': {
      exigirSimulada(conta, 'Fechar posições')
      const { ex, c } = await contaDeExecucao(conta.id)
      const r = await comoAdmin(() => ex.fecharPosicao(c, p.positionId, p.volume ?? null, 'manual'))
      return { resposta: { fechada: r.fechada, restante: 'restante' in r ? r.restante : null, pnl: r.plano.pnl } }
    }
    case 'modificar_posicao': {
      exigirSimulada(conta, 'Modificar SL/TP')
      const { ex, c } = await contaDeExecucao(conta.id)
      const r = await comoAdmin(() => ex.modificarPosicao(c, p.positionId, p.sl, p.tp))
      return { resposta: { posicao: r.posicao } }
    }
    case 'cancelar_ordem': {
      exigirSimulada(conta, 'Cancelar ordens')
      const { ex, c } = await contaDeExecucao(conta.id)
      const r = await comoAdmin(() => ex.cancelarPendente(c, p.orderId))
      return { resposta: { ordem: r.ordem } }
    }
    case 'fechar_tudo': {
      exigirSimulada(conta, 'Fechar tudo')
      if (p.confirmacao.trim() !== String(conta.mt5_login ?? '')) throw new ErroAdmin(400, 'escreve o login da conta para confirmar')
      const { ex, c } = await contaDeExecucao(conta.id)
      const lote = await comoAdmin(() => ex.fecharLote(c, 'todas'))
      const canceladas = p.cancelarPendentes ? (await comoAdmin(() => ex.cancelarTodas(c))).canceladas : 0
      return {
        resposta: { pedidas: lote.pedidas, fechadas: lote.fechadas.length, falhas: lote.falhas, canceladas },
        auditoria: { pedidas: lote.pedidas, fechadas: lote.fechadas.length, falhas: lote.falhas, canceladas },
      }
    }

    // ── estado ─────────────────────────────────────────────────────────────
    case 'pausar':
    case 'retomar':
    case 'fechar_conta':
    case 'marcar_breach':
    case 'reverter_breach': {
      const { abertas, pendentes } = conta.motor === 'sim' ? await contarAbertas(db, conta.id) : { abertas: 0, pendentes: 0 }
      const t = transicao(p.accao, conta as never, { agora, motivo: motivo ?? '', adminId, abertas, pendentes })
      if (!t.ok) throw new ErroAdmin(t.status, t.erro)
      // Guarda optimista no estado de partida: se o motor quebrou a conta entretanto, não se escreve por cima.
      let q = db.from('mtm_trading_accounts').update({ ...t.patch, updated_at: agora }).eq('id', conta.id).eq('estado', conta.estado)
      if (p.accao === 'pausar') q = q.is('pausada_em', null)
      const { data, error } = await q.select('id')
      if (error) falhaDeEscrita(error, 'não foi possível mudar o estado')
      if (!data?.length) throw new ErroAdmin(409, 'a conta mudou entretanto — actualiza e tenta outra vez')

      let canceladas = 0
      if (p.accao === 'pausar' && p.cancelarPendentes && pendentes > 0) {
        const { data: c } = await db.from('funded_orders').update({ estado: 'cancelada' })
          .eq('account_id', conta.id).eq('estado', 'pendente').select('id')
        canceladas = c?.length ?? 0
      }
      if (p.accao === 'marcar_breach' || p.accao === 'reverter_breach') {
        await db.from('mtm_tournament_participants')
          .update({ estado: p.accao === 'marcar_breach' ? 'quebrado' : 'ativo', updated_at: agora })
          .eq('account_id', conta.id)
      }
      return { resposta: { ok: true, patch: t.patch, canceladas } }
    }

    case 'avancar_fase': {
      const { abertas, pendentes } = await contarAbertas(db, conta.id)
      const erro = podeAvancarFase(conta as never, abertas, pendentes)
      if (erro) throw new ErroAdmin(409, erro)
      const { concluirDesafio, emitirContaFinanciada } = await import('./ciclo-de-vida')
      const r = await concluirDesafio(conta.id)
      if (!r.ok) throw new ErroAdmin(500, r.erro ?? 'não foi possível concluir a fase')
      let financiada: { ok: boolean; accountId?: string; motivo?: string } | null = null
      if (!r.proximaFase && p.emitirFinanciada && conta.user_id) {
        financiada = await emitirContaFinanciada(String(conta.user_id))
      }
      const novaId = r.proximaFase ?? financiada?.accountId ?? null
      const { data: nova } = novaId
        ? await db.from('mtm_trading_accounts').select('id, mt5_login, tipo, estado').eq('id', novaId).maybeSingle()
        : { data: null }
      const resposta = { certificado: r.codigo, emailEnviado: r.emailEnviado, proximaFase: r.proximaFase ?? null, financiada, novaConta: nova }
      return { resposta, auditoria: resposta }
    }

    case 'reset': {
      exigirSimulada(conta, 'O reset')
      if (p.confirmacao.trim() !== String(conta.mt5_login ?? '')) throw new ErroAdmin(400, 'escreve o login da conta para confirmar')
      const saldo = p.saldo ?? Number(conta.saldo_inicial ?? 0)
      const { data, error } = await db.rpc('funded_admin_reset_conta', { p_conta: conta.id, p_saldo: saldo })
      if (error) falhaDeEscrita(error, 'reset')
      return { resposta: { reset: data } }
    }

    case 'ajustar_saldo': {
      exigirSimulada(conta, 'Ajustar o saldo')
      // A ÚNICA escrita de saldo continua a ser funded_somar_saldo — chamada DENTRO da função que
      // regista o histórico, na mesma transacção (antes/depois saem da mesma instrução UPDATE).
      // Nada aqui lê o saldo para o escrever: a recusa de saldo negativo é da própria função.
      const { data, error } = await db.rpc('funded_ajustar_saldo_registado', {
        p_conta: conta.id, p_delta: p.delta, p_referencia: p.referencia, p_observacao: p.observacao ?? null,
        p_admin_id: ctx.adminId, p_admin_email: ctx.adminEmail ?? null, p_chave: null, p_preparado: p.preparadoId ?? null, p_tipo: 'ajuste',
      })
      if (error) erroDaFuncao(error, 'ajustar o saldo')
      const r = (data ?? {}) as { id?: string; saldo?: number; saldoAntes?: number }
      // O email SÓ sai com a caixa marcada pelo dono. Sem ela, nada é enviado.
      const email = p.enviarEmail && r.id ? await enviarEmailDoAjuste(ctx, r.id) : 'nao_pedido'
      return {
        resposta: { saldo: r.saldo == null ? null : Number(r.saldo), saldoAntes: r.saldoAntes == null ? null : Number(r.saldoAntes), delta: p.delta, referencia: p.referencia, ajusteId: r.id ?? null, email },
      }
    }

    case 'preparar_ajuste': {
      exigirSimulada(conta, 'Preparar um ajuste')
      // Rascunho pronto a clicar: NÃO mexe no saldo (estado 'preparado', sem antes/depois).
      const { data, error } = await db.from('mtm_funded_ajustes_saldo').insert({
        account_id: conta.id, tipo: 'ajuste', estado: 'preparado', delta: p.delta, referencia: p.referencia,
        observacao: p.observacao ?? null, admin_id: ctx.adminId, admin_email: ctx.adminEmail ?? null,
      }).select('id').single()
      if (error) erroDaFuncao(error, 'preparar o ajuste')
      return { resposta: { preparado: data?.id ?? null } }
    }

    case 'email_ajuste': {
      const estado = await enviarEmailDoAjuste(ctx, p.ajusteId)
      return { resposta: { email: estado } }
    }

    case 'transferir_saldo': {
      exigirSimulada(conta, 'Transferir saldo')
      const porLogin = !/^[0-9a-f-]{36}$/i.test(p.destino)
      const { data: dest } = await db.from('mtm_trading_accounts').select('id, mt5_login, user_id')
        .eq(porLogin ? 'mt5_login' : 'id', p.destino).maybeSingle()
      if (!dest) throw new ErroAdmin(404, `conta de destino ${p.destino} não existe`)
      if (dest.id === conta.id) throw new ErroAdmin(400, 'a origem e o destino são a mesma conta')
      // As duas pernas numa só transacção, com as linhas trancadas; valor nulo = tudo, lido sob a tranca.
      const { data, error } = await db.rpc('funded_transferir_saldo', {
        p_origem: conta.id, p_destino: dest.id, p_valor: p.valor, p_referencia: p.referencia, p_observacao: p.observacao ?? null,
        p_admin_id: ctx.adminId, p_admin_email: ctx.adminEmail ?? null, p_chave: null,
      })
      if (error) erroDaFuncao(error, 'transferir')
      return { resposta: { transferencia: data, destino: dest.mt5_login, mesmoDono: dest.user_id === conta.user_id } }
    }

    case 'repor_saldo_negativo': {
      exigirSimulada(conta, 'Repor o saldo')
      const { data, error } = await db.rpc('funded_repor_saldo_negativo', {
        p_conta: conta.id, p_alvo: p.alvo, p_referencia: p.referencia, p_observacao: p.observacao ?? null,
        p_admin_id: ctx.adminId, p_admin_email: ctx.adminEmail ?? null, p_chave: null,
      })
      if (error) erroDaFuncao(error, 'repor o saldo')
      return { resposta: { reposicao: data } }
    }

    case 'arquivar': {
      const { data, error } = await db.rpc('funded_arquivar_conta', { p_conta: conta.id, p_motivo: p.motivo, p_admin_id: ctx.adminId })
      if (error) erroDaFuncao(error, 'arquivar')
      return { resposta: { arquivo: data } }
    }

    case 'desarquivar': {
      const { data, error } = await db.rpc('funded_desarquivar_conta', { p_conta: conta.id, p_admin_id: ctx.adminId })
      if (error) erroDaFuncao(error, 'desarquivar')
      return { resposta: { desarquivo: data } }
    }

    case 'estender_prazo': {
      const antes = Number(conta.prazo_extra_dias ?? 0)
      const { data, error } = await db.from('mtm_trading_accounts')
        .update({ prazo_extra_dias: antes + p.dias, updated_at: agora })
        .eq('id', conta.id).eq('prazo_extra_dias', antes).select('prazo_extra_dias')
      if (error) falhaDeEscrita(error, 'estender prazo')
      if (!data?.length) throw new ErroAdmin(409, 'o prazo mudou entretanto — actualiza e tenta outra vez')
      return { resposta: { prazoExtraDias: antes + p.dias } }
    }

    case 'definir_analise': {
      // As métricas são reescritas pelo motor (ler-juntar-gravar). Guarda optimista em
      // metricas_lidas_em: se o motor gravou entre a leitura e a escrita, relê-se e tenta-se outra vez.
      for (let tentativa = 0; tentativa < 4; tentativa++) {
        const { data: c } = await db.from('mtm_trading_accounts').select('metricas, metricas_lidas_em').eq('id', conta.id).maybeSingle()
        if (!c) throw new ErroAdmin(404, 'conta desaparecida')
        const metricas = { ...((c.metricas ?? {}) as Record<string, unknown>), analise: p.valor }
        let q = db.from('mtm_trading_accounts').update({ metricas, updated_at: agora }).eq('id', conta.id)
        q = c.metricas_lidas_em == null ? q.is('metricas_lidas_em', null) : q.eq('metricas_lidas_em', c.metricas_lidas_em as string)
        const { data } = await q.select('id')
        if (data?.length) return { resposta: { analise: p.valor } }
      }
      throw new ErroAdmin(409, 'o motor está a escrever nesta conta — tenta daqui a uns segundos')
    }

    case 'definir_aceita_t2t': {
      exigirSimulada(conta, 'O Tap to Trade numa conta MTM Funded')
      const { error } = await db.from('mtm_trading_accounts').update({ aceita_t2t: p.valor, updated_at: agora }).eq('id', conta.id)
      if (error) throw new ErroAdmin(500, error.message)
      return { resposta: { aceitaT2T: p.valor } }
    }

    case 'definir_estrategia': {
      exigirSimulada(conta, 'Seguir uma estratégia')
      const slug = p.slug ? p.slug : null
      if (slug) {
        const { data: prov } = await db.from('mtmauto_providers').select('slug').eq('slug', slug).maybeSingle()
        if (!prov) throw new ErroAdmin(404, `estratégia ${slug} não existe`)
      }
      const { error } = await db.from('mtm_trading_accounts').update({ segue_estrategia: slug, updated_at: agora }).eq('id', conta.id)
      if (error) throw new ErroAdmin(500, error.message)
      return { resposta: { segueEstrategia: slug } }
    }

    case 'regenerar_credenciais': {
      exigirSimulada(conta, 'Regenerar credenciais')
      const cred = await import('./simulado/credenciais')
      const { cifrar } = await import('./credenciais')
      const master = cred.gerarPassword()
      const investor = cred.gerarPassword()
      const login = p.novoLogin ? await cred.gerarLoginUnico() : String(conta.mt5_login ?? '')
      if (!login) throw new ErroAdmin(409, 'conta sem login — usa «gerar credenciais» primeiro')
      const { error } = await db.from('mtm_trading_accounts').update({
        mt5_login: login, mt5_password_cifrada: cifrar(master), mt5_investor_cifrada: cifrar(investor), updated_at: agora,
      }).eq('id', conta.id)
      if (error) throw new ErroAdmin(500, error.message)
      // O dono recebe o aviso da mudança com um link seguro (nunca as passwords no email).
      const { enviarCredenciaisDaConta } = await import('./credenciais-servico')
      const email = await enviarCredenciaisDaConta(conta.id, 'regeneracao', { db, incluirCasa: true })
      return {
        // Mostradas UMA vez no modal. Nem email, nem auditoria, nem logs.
        resposta: { login, servidor: conta.servidor ?? 'MTM Funded', password: master, investor, emailAoDono: email.enviado },
        auditoria: { login, novoLogin: p.novoLogin, passwords: 'regeneradas (não guardadas)' },
      }
    }

    /**
     * APAGAR A CONTA — irreversível, e por isso a acção mais fechada do ficheiro.
     *
     * Três fechaduras, por esta ordem: o login escrito à mão, a decisão pura (que recusa se a
     * conta estiver viva para alguém) e a limpeza do que a base não vê. A auditoria já ficou
     * escrita pela rota ANTES de chegarmos aqui — `mtm_funded_admin_audit` não tem FK para a
     * conta, por isso o registo sobrevive à linha que descreve.
     */
    case 'apagar_conta': {
      const { confirmacaoApagarValida } = await import('./apagar-conta')
      const { recolherPendurados, apagarContaComTudo } = await import('./apagar-conta-servidor')
      const login = (conta.mt5_login as string) ?? null
      if (!confirmacaoApagarValida(p.confirmacao, login)) {
        throw new ErroAdmin(400, login ? 'escreve o login da conta para confirmar' : 'escreve APAGAR para confirmar')
      }
      const pendurados = await recolherPendurados(db, conta)
      if (!pendurados.decisao.pode) {
        // Recusa-se e explica-se. Nunca se apaga meia conta.
        throw new ErroAdmin(409, pendurados.decisao.bloqueios.join(' · '))
      }
      const r = await apagarContaComTudo(db, pendurados)
      return {
        resposta: { ...r },
        // A fotografia do «antes» já vai na auditoria; aqui fica o que levou consigo.
        auditoria: {
          login: r.login, limpou: r.limpou, emCascata: r.emCascata,
          metaapiPorTocar: r.metaapiPorTocar, arrasta: pendurados.decisao.arrasta,
        },
      }
    }

    case 'notificar': {
      if (!conta.user_id) throw new ErroAdmin(409, 'conta sem dono')
      const { notificarDono } = await import('./admin-conta-avisos')
      const r = await notificarDono({ db, userId: String(conta.user_id), conta, modelo: p.modelo, texto: p.texto ?? null, email: p.email, push: p.push })
      return { resposta: r }
    }

    case 'levantamento': {
      const { data: l } = await db.from('mtm_funded_withdrawals').select('id, estado, valor_usd, account_id')
        .eq('id', p.levantamentoId).eq('account_id', conta.id).maybeSingle()
      if (!l) throw new ErroAdmin(404, 'pedido não encontrado nesta conta')

      let abertas: number | null = 0
      let pendentes: number | null = 0
      if (['aprovado', 'pago'].includes(p.estado)) {
        if (conta.motor === 'sim') ({ abertas, pendentes } = await contarAbertas(db, conta.id))
        else if (conta.metaapi_account_id) {
          const { readOpenPositions } = await import('@/lib/mtmcopy/metaapi')
          const pos = await readOpenPositions(String(conta.metaapi_account_id)).catch(() => null)
          abertas = pos == null ? null : pos.length
          pendentes = pos == null ? null : 0
        }
      }
      const { data: outros } = await db.from('mtm_funded_withdrawals').select('valor_usd')
        .eq('account_id', conta.id).in('estado', ['pago', 'aprovado']).neq('id', l.id)
      const m = (conta.metricas ?? {}) as Record<string, unknown>
      const erro = guardaLevantamento({
        conta: {
          tipo: conta.tipo, estado: conta.estado, motor: conta.motor, saldo_inicial: Number(conta.saldo_inicial ?? 0),
          sim_saldo: conta.sim_saldo == null ? null : Number(conta.sim_saldo),
          equityMetricas: typeof m.equity === 'number' ? m.equity : null,
          // Capital da casa com prazo: a guarda recusa e diz a data (ver bloqueioDeLevantamento).
          metricas: m,
        },
        abertas, pendentes,
        jaPagoOutros: (outros ?? []).reduce((t, x) => t + Number(x.valor_usd ?? 0), 0),
        valor: Number(l.valor_usd), estadoAtual: String(l.estado), novoEstado: p.estado, motivo: p.motivo,
      })
      if (erro) throw new ErroAdmin(409, erro)

      const { data: feito, error } = await db.from('mtm_funded_withdrawals').update({
        estado: p.estado,
        ...(p.motivo ? { motivo: p.motivo.slice(0, 400) } : {}),
        ...(p.estado === 'pago' ? { pago_em: agora } : {}),
        atualizado_em: agora,
      }).eq('id', l.id).eq('estado', l.estado).select('id')
      if (error) throw new ErroAdmin(500, error.message)
      if (!feito?.length) throw new ErroAdmin(409, 'o pedido mudou entretanto — actualiza')

      // Pago fecha o ciclo (igual ao painel de levantamentos): a Funded é substituída por uma igual.
      let renovacao: Record<string, unknown> | null = null
      if (p.estado === 'pago') {
        const { renovarContaAposLevantamento } = await import('./ciclo-de-vida')
        const r = await renovarContaAposLevantamento(conta.id, { levantamentoId: l.id as string, valorUsd: Number(l.valor_usd) })
          .catch((e) => ({ ok: false, motivo: String(e) }))
        renovacao = r.ok ? { contaNova: (r as { contaNova?: string }).contaNova } : { motivo: (r as { motivo?: string }).motivo }
      }
      return { resposta: { levantamento: l.id, estado: p.estado, valor: Number(l.valor_usd), renovacao } }
    }
  }
}
