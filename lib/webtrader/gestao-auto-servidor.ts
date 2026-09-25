/**
 * O EXECUTOR DA GESTÃO AUTOMÁTICA NAS CONTAS DE CORRETORA — quem lê a configuração e mexe no SL.
 *
 * Era isto que faltava. A decisão é pura (gestao-auto-real.ts) e a regra é a do motor das mestres
 * (`decidirGestao`); aqui está só o vai-e-vem: ler as posições pelo adaptador da corretora, decidir,
 * e pedir `modificar` quando — e SÓ quando — a decisão diz para agir.
 *
 * QUEM CHAMA ISTO, e porque são dois:
 *  1. a própria leitura de posições do WebTrader (`GET …/posicoes`). O ecrã já relê a conta de 3 em
 *     3 s (TradeLocker) ou de 5 em 5 s (MT5), e essas posições já foram pagas: aproveitá-las dá ao
 *     trader um trailing a segundos, sem uma única leitura extra na corretora;
 *  2. a cron de 1 minuto, para a gestão não morrer quando se fecha o separador — que era exactamente
 *     a razão pela qual isto nunca foi feito no browser.
 *
 * É por isso que o trailing de uma conta de corretora NÃO é tão fino como o das contas simuladas
 * (onde o motor do VPS vê cada tick). Com o separador aberto anda a segundos; fechado, a minutos. Um
 * trailing a minutos continua a valer muito mais do que o trailing que não existia — e a alternativa
 * (um terminal nosso por conta de cliente) não é deployável hoje.
 *
 * NADA aqui inventa gestão: sem linha em `webtrader_gestao_auto` gravada pelo dono, uma posição nunca
 * é tocada. E o executor só sabe fazer UMA coisa à corretora: mover o SL. Não fecha, não abre, não
 * cancela — ver os travões no cabeçalho de gestao-auto-real.ts.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import type { AdaptadorCorretora, PlataformaWT, PosicaoWT } from './corretoras/tipos'
import { lerRefConta } from './corretoras/regras'
import { adaptadorDoDono } from './contas'
import {
  type ConfigGestaoReal, configDaLinha, configTemGestao, decidirGestaoReal, precoDeGestao,
  simboloDaCorretora, validarConfigPedida,
} from './gestao-auto-real'

const TABELA = 'webtrader_gestao_auto'

export interface LinhaGestaoAuto {
  position_id: string
  symbol: string
  digits: number
  trailing_distancia: number | null
  trailing_ativacao: number | null
  be_gatilho: number | null
  be_offset: number
  be_feito: boolean
  sl_aplicado: number | null
  ultimo_motivo: string | null
  ultima_passagem: string | null
  ultimo_erro: string | null
  so_com_separador: boolean
}

const COLUNAS = 'position_id, symbol, digits, trailing_distancia, trailing_ativacao, be_gatilho, be_offset, be_feito, sl_aplicado, ultimo_motivo, ultima_passagem, ultimo_erro, so_com_separador'

/** A tabela pode ainda não estar migrada: sem ela o WebTrader funciona como antes (sem gestão). */
function semTabela(erro: { code?: string; message?: string } | null): boolean {
  return Boolean(erro && (erro.code === '42P01' || /webtrader_gestao_auto/.test(erro.message ?? '')))
}

/** A gestão gravada desta conta, para o ecrã pintar os botões pelo ESTADO REAL do servidor. */
export async function lerGestaoAutoDaConta(userId: string, contaRef: string): Promise<LinhaGestaoAuto[]> {
  const { data, error } = await getSupabaseAdmin().from(TABELA).select(COLUNAS).eq('user_id', userId).eq('conta_ref', contaRef).eq('ativa', true)
  if (error) {
    if (!semTabela(error)) console.error('[wt-gestao] ler', error.message)
    return []
  }
  return (data ?? []) as unknown as LinhaGestaoAuto[]
}

/**
 * Grava (ou apaga) a gestão de UMA posição. É o único caminho para autorizar o servidor a mexer num
 * SL: a posição tem de existir AGORA na corretora e ser desta conta — não se aceita um id qualquer
 * vindo do cliente, porque uma linha com um id de outra conta era uma ordem de mover um SL alheio.
 */
export async function guardarGestaoAuto(opcoes: {
  userId: string
  contaRef: string
  plataforma: PlataformaWT
  positionId: string
  pedido: Record<string, unknown>
  adaptador: AdaptadorCorretora
}): Promise<{ ok: true; apagada: boolean; linha: LinhaGestaoAuto | null }> {
  const { userId, contaRef, plataforma, positionId, pedido, adaptador } = opcoes
  const pos = (await adaptador.posicoes()).find((p) => p.id === positionId)
  if (!pos) throw Object.assign(new Error('Posição não encontrada nesta conta.'), { status: 404 })

  const digits = Number(pedido.digits)
  const s = simboloDaCorretora(pos.symbol, Number.isFinite(digits) && digits > 0 ? digits : 5)
  const v = validarConfigPedida(pedido, s)
  if (!v.ok) throw Object.assign(new Error(v.erro), { status: 400 })

  const db = getSupabaseAdmin()
  // Desligar tudo = apagar a linha. Deixar uma linha «vazia» era deixar o executor a olhar para
  // posições que ninguém pediu para gerir.
  if (!configTemGestao({ ...v.config, be_feito: false })) {
    const { error } = await db.from(TABELA).delete().eq('user_id', userId).eq('conta_ref', contaRef).eq('position_id', positionId)
    if (error && !semTabela(error)) throw Object.assign(new Error(error.message), { status: 500 })
    return { ok: true, apagada: true, linha: null }
  }

  const refLida = lerRefConta(plataforma, contaRef)
  // A TradeLocker por sessão do separador não tem credenciais no servidor: gere-se, mas só enquanto
  // o WebTrader estiver aberto. O ecrã diz isto ao trader em vez de prometer 24/7 que não existe.
  const soComSeparador = refLida?.plataforma === 'tradelocker' && refLida.origem === 'sessao'

  const { data, error } = await db.from(TABELA).upsert({
    user_id: userId, conta_ref: contaRef, plataforma, position_id: positionId,
    symbol: pos.symbol, direcao: pos.direcao, digits: s.digits,
    trailing_distancia: v.config.trailing_distancia, trailing_ativacao: v.config.trailing_ativacao,
    be_gatilho: v.config.be_gatilho, be_offset: v.config.be_offset,
    // Ligar o BE de novo re-arma o gatilho: quem volta a tocar no botão quer que ele conte outra vez.
    be_feito: false, ultimo_erro: null, so_com_separador: soComSeparador, ativa: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'conta_ref,position_id' }).select(COLUNAS).maybeSingle()
  if (error) throw Object.assign(new Error(semTabela(error) ? 'A gestão automática ainda não está migrada nesta base.' : error.message), { status: 500 })
  return { ok: true, apagada: false, linha: (data ?? null) as unknown as LinhaGestaoAuto | null }
}

export interface ResultadoGestaoAuto {
  avaliadas: number
  movidos: number
  limpas: number
  erros: number
  /** As linhas que ficaram activas — o ecrã pinta os botões com estas, sem uma segunda consulta. */
  linhas: LinhaGestaoAuto[]
}

/**
 * Uma passagem pela gestão de uma conta. `posicoes` pode vir de fora (as que a rota acabou de ler)
 * para não pagar a leitura duas vezes.
 *
 * A ORDEM importa: primeiro limpam-se as configurações de posições que já não existem (fechadas), e
 * só depois se decide — assim um id reciclado pela corretora nunca herda a gestão de outra trade.
 */
export async function aplicarGestaoAutoNaConta(
  adaptador: AdaptadorCorretora,
  ctx: { userId: string; contaRef: string },
  posicoesDadas?: PosicaoWT[],
): Promise<ResultadoGestaoAuto> {
  const out: ResultadoGestaoAuto = { avaliadas: 0, movidos: 0, limpas: 0, erros: 0, linhas: [] }
  const db = getSupabaseAdmin()
  const linhas = await lerGestaoAutoDaConta(ctx.userId, ctx.contaRef)
  if (!linhas.length) return out

  // Só agora se pedem posições: uma conta sem gestão configurada não gera leituras nenhumas.
  const posicoes = posicoesDadas ?? (await adaptador.posicoes())
  const porId = new Map(posicoes.map((p) => [p.id, p]))

  /**
   * APAGAR SÓ COM PROVA DE QUE A LEITURA FUNCIONOU.
   *
   * Uma lista vazia tanto pode significar «não há posições abertas» como «a corretora respondeu mal
   * agora». Como aqui se APAGA a configuração do dono, tratar as duas da mesma maneira era perder
   * em silêncio, num soluço de rede, o trailing que ele ligou à mão — e ele só daria por isso
   * quando o SL não se mexesse.
   *
   * Por isso só se limpa quando a leitura trouxe pelo menos UMA posição: isso prova que ela
   * funcionou, e o que não está lá está mesmo fechado. Se a conta chegar de facto a zero posições,
   * as linhas ficam mais um bocado — não fazem mal nenhum (o laço abaixo salta-as) e desaparecem na
   * primeira passagem em que haja alguma posição aberta.
   */
  const fechadas = posicoes.length
    ? linhas.filter((l) => !porId.has(l.position_id)).map((l) => l.position_id)
    : []
  if (fechadas.length) {
    const { error } = await db.from(TABELA).delete().eq('user_id', ctx.userId).eq('conta_ref', ctx.contaRef).in('position_id', fechadas)
    if (!error) out.limpas = fechadas.length
  }

  for (const linha of linhas) {
    const pos = porId.get(linha.position_id)
    if (!pos) continue
    out.linhas.push(linha)
    out.avaliadas++
    const cfg: ConfigGestaoReal = configDaLinha(linha as unknown as Record<string, unknown>)
    const s = simboloDaCorretora(pos.symbol, linha.digits || 5)
    try {
      // A cotação só se pede quando a posição não traz preço (a TradeLocker não traz) — e o preço
      // indicativo do nosso feed é recusado dentro de `precoDeGestao`.
      const cotacao = pos.precoAtual != null && pos.precoAtual > 0 ? null : await adaptador.preco(pos.symbol).catch(() => null)
      const d = decidirGestaoReal(pos, cfg, s, precoDeGestao(pos, cotacao))
      // A linha devolvida ao ecrã fica com o que ACABOU de acontecer, sem uma segunda consulta.
      linha.be_feito = d.beFeito
      linha.ultimo_erro = null
      if (!d.agir) {
        // Mesmo sem mexer no SL, o «break-even feito» tem de ficar gravado (senão o gatilho voltava
        // a disparar para trás na passagem seguinte).
        await db.from(TABELA).update({
          be_feito: d.beFeito, ultima_passagem: new Date().toISOString(), ultimo_motivo: d.motivo, ultimo_erro: null,
        }).eq('user_id', ctx.userId).eq('conta_ref', ctx.contaRef).eq('position_id', linha.position_id)
        continue
      }
      // O TP vai como está: nenhuma plataforma mexe num TP que chega null (ver os adaptadores), e
      // assim o trailing nunca apaga o alvo que o trader pôs.
      /**
       * «Nothing to change» não é uma falha — é o SL já estar onde o queremos pôr.
       *
       * 25/09, primeiro teste real do Ricardo: uma das três posições devolveu «Reason for
       * rejection: Nothing to change.» e a linha ficou com um erro vermelho a dizer que a corretora
       * recusou, quando na verdade estava tudo certo. Acontece porque a TradeLocker entrega o SL
       * como uma ORDEM ligada à posição: se essa ordem não vier na lista, `pos.sl` chega a `null`,
       * o travão do «já está igual ou melhor» não tem com que comparar, e manda-se à cega.
       *
       * Tratar isto como sucesso resolve as duas metades: o alarme falso desaparece e o
       * `sl_aplicado` fica gravado, por isso a passagem seguinte já tem com que comparar e não
       * volta a bater à porta da corretora de graça.
       */
      try {
        await adaptador.modificar({ alvo: 'posicao', id: pos.id, sl: d.sl, tp: pos.tp })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!/nothing to change/i.test(msg)) throw e
      }
      out.movidos++
      linha.sl_aplicado = d.sl
      await db.from(TABELA).update({
        be_feito: d.beFeito, sl_aplicado: d.sl, ultimo_motivo: d.motivo,
        ultima_passagem: new Date().toISOString(), ultimo_erro: null,
      }).eq('user_id', ctx.userId).eq('conta_ref', ctx.contaRef).eq('position_id', linha.position_id)
    } catch (e) {
      out.erros++
      const msg = e instanceof Error ? e.message : 'erro'
      linha.ultimo_erro = msg.slice(0, 300)
      // A falha fica VISÍVEL na linha (o ecrã mostra-a): um trailing que não consegue mexer o SL e
      // não o diz é pior do que não existir.
      await db.from(TABELA).update({ ultima_passagem: new Date().toISOString(), ultimo_erro: msg.slice(0, 300) })
        .eq('user_id', ctx.userId).eq('conta_ref', ctx.contaRef).eq('position_id', linha.position_id)
      console.error('[wt-gestao]', ctx.contaRef, linha.position_id, msg)
    }
  }
  return out
}

/**
 * Passagem por TODAS as contas com gestão activa — o que a cron corre. Contas TradeLocker por sessão
 * do separador ficam de fora (não há credenciais no servidor para as abrir): elas são geridas pela
 * leitura do próprio WebTrader, e a linha já está marcada `so_com_separador` para o ecrã o dizer.
 */
export async function correrGestaoAutoDeTodas(): Promise<{ contas: number; saltadas: number } & Omit<ResultadoGestaoAuto, 'linhas'>> {
  const total = { contas: 0, saltadas: 0, avaliadas: 0, movidos: 0, limpas: 0, erros: 0 }
  const { data, error } = await getSupabaseAdmin().from(TABELA)
    .select('user_id, conta_ref, plataforma, so_com_separador').eq('ativa', true).limit(2000)
  if (error) {
    if (!semTabela(error)) console.error('[wt-gestao] cron', error.message)
    return total
  }
  const contas = new Map<string, { userId: string; contaRef: string; plataforma: PlataformaWT }>()
  for (const r of data ?? []) {
    if (r.so_com_separador) { total.saltadas++; continue }
    const chave = `${r.user_id}|${r.conta_ref}`
    if (!contas.has(chave)) contas.set(chave, { userId: String(r.user_id), contaRef: String(r.conta_ref), plataforma: String(r.plataforma) as PlataformaWT })
  }
  for (const c of contas.values()) {
    total.contas++
    try {
      const a = await adaptadorDoDono(c.userId, c.plataforma, c.contaRef)
      const r = await aplicarGestaoAutoNaConta(a, { userId: c.userId, contaRef: c.contaRef })
      total.avaliadas += r.avaliadas; total.movidos += r.movidos; total.limpas += r.limpas; total.erros += r.erros
    } catch (e) {
      // Uma conta desligada da corretora (ou fora da quota) não trava as outras. Não se apaga nada:
      // a gestão continua a existir e volta a correr quando a conta voltar.
      total.erros++
      console.error('[wt-gestao] conta', c.contaRef, e instanceof Error ? e.message : 'erro')
    }
  }
  return total
}

/**
 * A passagem «de graça» colada à leitura de posições do WebTrader, com um travão por conta para não
 * correr em cada separador aberto. Nunca deixa escapar um erro: se a gestão falhar, o trader continua
 * a ver as posições dele (o estado da falha fica na linha e aparece no botão).
 */
const ultimaPassagem = new Map<string, number>()
const INTERVALO_PASSAGEM_MS = 3_000

export async function gestaoAutoAoLerPosicoes(
  adaptador: AdaptadorCorretora, ctx: { userId: string | null; contaRef: string }, posicoes: PosicaoWT[],
): Promise<LinhaGestaoAuto[]> {
  if (!ctx.userId) return []
  const chave = `${ctx.userId}|${ctx.contaRef}`
  const t = Date.now()
  const anterior = ultimaPassagem.get(chave) ?? 0
  // Dois separadores abertos na mesma conta não decidem duas vezes: dentro do travão só se lê o
  // estado para pintar os botões.
  if (t - anterior < INTERVALO_PASSAGEM_MS) return lerGestaoAutoDaConta(ctx.userId, ctx.contaRef)
  ultimaPassagem.set(chave, t)
  if (ultimaPassagem.size > 2000) ultimaPassagem.clear()
  try {
    return (await aplicarGestaoAutoNaConta(adaptador, { userId: ctx.userId, contaRef: ctx.contaRef }, posicoes)).linhas
  } catch (e) {
    console.error('[wt-gestao] leitura', ctx.contaRef, e instanceof Error ? e.message : 'erro')
    return lerGestaoAutoDaConta(ctx.userId, ctx.contaRef)
  }
}
