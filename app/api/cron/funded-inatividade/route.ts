import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { isCronAuthorized } from '@/lib/cron-auth'
import {
  DIAS_INATIVIDADE,
  MOTIVO_INATIVIDADE,
  TECTO_POR_PASSAGEM,
  contasAAvisar,
  contasACair,
  type ContaParaInatividade,
} from '@/lib/mtmfunded/inatividade'
import { sendTelegramChannelMessage } from '@/lib/mtmcopy/telegram-bot'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * A REGRA DE INATIVIDADE A CORRER — 30 dias sem fechar uma trade quebra e apaga a conta.
 *
 * A decisão está toda em `lib/mtmfunded/inatividade.ts`, pura e testada. Aqui só se vai buscar os
 * factos, se executa o que ela mandar, e se conta o que se fez.
 *
 * ═══ NASCE DESARMADO, E ISSO NÃO É TIMIDEZ ══════════════════════════════════════════════════
 *
 * Isto apaga contas de clientes e não há como voltar atrás. Por isso:
 *
 *  · sem `site_settings.funded_inatividade.armada === true`, corre e RELATA sem tocar em nada.
 *    O dono pode vê-lo funcionar durante os dias que quiser antes de lhe dar a faca;
 *  · mesmo armado há um TECTO por passagem ({@link TECTO_POR_PASSAGEM}). Se um dia uma data ficar
 *    mal gravada em massa, o estrago para no tecto e há uma manhã para dar por ele — sem tecto,
 *    uma passagem enganada apagava a base inteira antes de alguém acordar.
 *
 * ═══ UM NÚMERO QUE O DONO TEM DE VER ANTES DE ARMAR ═════════════════════════════════════════
 *
 * Medido a 27/09/2026: das 124 contas de desafio activas, 119 NUNCA fecharam uma única trade, e
 * todas as contas desta base foram criadas a partir de 11/09. Como o relógio conta desde a criação
 * quando não há trades, no dia 11/10 essas 119 passam a cair de uma vez. É o que a regra diz e
 * pode bem ser o que se quer — mas é um número que ninguém deve descobrir depois de acontecer.
 */

const CHAVE = 'funded_inatividade'
const ADMIN_CHAT = () => process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || '1446687230'
/** O tipo do registo que impede o mesmo aviso de sair duas vezes no mesmo dia. */
const TIPO_AVISO = 'funded_inatividade_vespera'

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getSupabaseAdmin()
  const agora = Date.now()

  const { data: interruptor } = await db.from('site_settings').select('value').eq('key', CHAVE).maybeSingle()
  const bruto = typeof interruptor?.value === 'string' ? JSON.parse(interruptor.value) : interruptor?.value
  // Só o booleano `true` arma. Ler qualquer coisa "verdadeira" abria isto com um `"sim"` distraído.
  const armada = (bruto as { armada?: unknown } | null)?.armada === true
  const ensaio = !armada || request.nextUrl.searchParams.get('dryRun') === '1'

  const { data: contas, error } = await db
    .from('mtm_trading_accounts')
    .select('id, user_id, tipo, estado, mt5_login, conta_casa, conta_real_casa, sem_regras, created_at')
    .in('estado', ['ativa', 'pedida'])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (contas ?? []).map((c) => String((c as { id: string }).id))
  if (!ids.length) return NextResponse.json({ ok: true, ensaio, analisadas: 0, caem: [] })

  /**
   * A última trade FECHADA de cada conta, e os certificados. Duas leituras simples em vez de
   * embeds do PostgREST: esta base já foi ao chão por causa de embeds (duas FK para a mesma
   * tabela devolvem 500 em todos), e aqui um 500 significaria não saber quem negociou.
   */
  const [fechadas, certificados] = await Promise.all([
    db.from('funded_positions').select('account_id, fechada_em').in('account_id', ids).not('fechada_em', 'is', null),
    db.from('mtm_certificates').select('account_id').in('account_id', ids),
  ])

  const ultimaDe = new Map<string, string>()
  for (const r of (fechadas.data ?? []) as Array<{ account_id: string; fechada_em: string }>) {
    const atual = ultimaDe.get(r.account_id)
    if (!atual || Date.parse(r.fechada_em) > Date.parse(atual)) ultimaDe.set(r.account_id, r.fechada_em)
  }
  const comCertificado = new Set((certificados.data ?? []).map((r) => String((r as { account_id: string }).account_id)))

  const factos: ContaParaInatividade[] = (contas ?? []).map((c) => {
    const l = c as Record<string, unknown>
    const id = String(l.id)
    return {
      id,
      tipo: String(l.tipo ?? ''),
      estado: String(l.estado ?? ''),
      contaCasa: l.conta_casa as boolean | null,
      contaRealCasa: l.conta_real_casa as boolean | null,
      semRegras: l.sem_regras as boolean | null,
      criadaEm: l.created_at as string | null,
      ultimaTradeFechadaEm: ultimaDe.get(id) ?? null,
      temCertificado: comCertificado.has(id),
    }
  })

  const caem = contasACair(factos, agora)
  const porLogin = new Map(
    (contas ?? []).map((c) => [String((c as { id: string }).id), (c as { mt5_login?: unknown }).mt5_login ?? null]),
  )
  const lista = caem.map((x) => ({
    id: x.conta.id,
    login: porLogin.get(x.conta.id) ?? null,
    tipo: x.conta.tipo,
    diasParado: x.diasParado,
    porque: x.porque,
  }))

  /**
   * O AVISO DA VÉSPERA — a lista de quem cai amanhã, no Telegram do dono.
   *
   * Sai SEMPRE, armado ou não, e mesmo num ensaio: avisar não apaga nada, e o valor disto é
   * precisamente poder travar antes. O dedup vive em `notifications` (uma linha por conta e por
   * dia), porque este cron pode ser corrido à mão além da passagem diária — e receber a mesma
   * lista três vezes ensina a ignorá-la.
   */
  const vespera = contasAAvisar(factos, agora)
  let avisadas = 0
  if (vespera.length) {
    const dia = new Date(agora).toISOString().slice(0, 10)
    const chaves = vespera.map((x) => `${TIPO_AVISO}:${dia}:${x.conta.id}`)
    const { data: jaAvisados } = await db
      .from('notifications')
      .select('title')
      .eq('type', TIPO_AVISO)
      .in('title', chaves)
    const jaLa = new Set((jaAvisados ?? []).map((r) => String((r as { title?: string }).title ?? '')))
    const novos = vespera.filter((x) => !jaLa.has(`${TIPO_AVISO}:${dia}:${x.conta.id}`))

    if (novos.length) {
      const linha = (x: (typeof novos)[number]) =>
        `· ${porLogin.get(x.conta.id) ?? x.conta.id} (${x.conta.tipo}, parada há ${x.diasParado} d)`
      const amostra = novos.slice(0, 15).map(linha).join('\n')
      await sendTelegramChannelMessage(
        ADMIN_CHAT(),
        `⏳ <b>Inatividade — amanhã caem ${novos.length} conta(s)</b>\n` +
          `${DIAS_INATIVIDADE} dias sem fechar uma trade. Serão QUEBRADAS e APAGADAS.\n\n${amostra}` +
          (novos.length > 15 ? `\n… e mais ${novos.length - 15}.` : '') +
          `\n\nPara travar: <code>site_settings.${CHAVE} = {"armada": false}</code>` +
          (armada ? '' : '\n\n<i>(a regra está DESARMADA — hoje isto é só um aviso)</i>'),
      ).catch(() => undefined)

      // O registo só se escreve DEPOIS de a mensagem ter saído: marcar antes e falhar o envio
      // fazia o aviso desaparecer para sempre, em silêncio, no dia em que mais falta fazia.
      await db
        .from('notifications')
        .insert(novos.map((x) => ({ type: TIPO_AVISO, title: `${TIPO_AVISO}:${dia}:${x.conta.id}`, message: x.conta.id })))
        .then(undefined, () => undefined)
      avisadas = novos.length
    }
  }

  if (ensaio) {
    return NextResponse.json({
      ok: true,
      ensaio: true,
      armada,
      dias: DIAS_INATIVIDADE,
      analisadas: factos.length,
      caem: lista,
      avisadasVespera: avisadas,
      nota: armada
        ? 'Ensaio pedido no pedido (dryRun=1): nada foi apagado.'
        : `Desarmado. Para armar: site_settings.${CHAVE} = {"armada": true}.`,
    })
  }

  const { quebrarConta } = await import('@/lib/mtmfunded/ciclo-de-vida')
  const feitas: Array<Record<string, unknown>> = []
  for (const alvo of lista.slice(0, TECTO_POR_PASSAGEM)) {
    try {
      const r = await quebrarConta(alvo.id, `${MOTIVO_INATIVIDADE} (${alvo.diasParado} d)`, { apagar: true })
      feitas.push({ ...alvo, ok: r.ok, erro: r.erro ?? null })
    } catch (e) {
      feitas.push({ ...alvo, ok: false, erro: e instanceof Error ? e.message.slice(0, 160) : 'erro' })
    }
  }

  console.info(`[funded-inatividade] ${feitas.filter((f) => f.ok).length}/${lista.length} contas quebradas e apagadas`)
  return NextResponse.json({
    ok: true,
    ensaio: false,
    dias: DIAS_INATIVIDADE,
    analisadas: factos.length,
    caem: lista.length,
    avisadasVespera: avisadas,
    feitas,
    porFazer: Math.max(0, lista.length - TECTO_POR_PASSAGEM),
  })
}
