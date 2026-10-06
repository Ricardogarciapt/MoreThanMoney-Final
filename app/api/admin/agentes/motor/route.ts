import { NextRequest, NextResponse } from 'next/server'
import { verifyAgentAccess } from '@/lib/agent-site-api'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { atribuirEGravar } from '@/lib/agentes/receita'
import { correrAvaliacao } from '@/lib/agentes/motor'
import { correrReproducao } from '@/lib/agentes/reproducao'
import { aplicarDecisaoCeo, correrReversoes, gravarProposta } from '@/lib/agentes/evolucao'
import { gravarInterruptor, lerInterruptor } from '@/lib/agentes/motor-interruptor'
import { validarReescrita } from '@/lib/agentes/instrucoes-guarda'
import {
  contarHoje, decidirContacto, juntarEvidencia, registarEnvio, TECTOS_PADRAO,
  type Familia, type PedidoContacto, type Tectos,
} from '@/lib/agentes/contacto-inicial'
import type { TipoEnvio } from '@/lib/envios-aprovacao'

/**
 * A PORTA DO MOTOR AUTÓNOMO — o único sítio por onde `aios/motor/orquestrador.py` ESCREVE.
 *
 * ═══ PORQUE É QUE O MOTOR NÃO ESCREVE DIRECTO NA BASE ══════════════════════════════════════
 *
 * O motor é Python e corre no Mac; as regras (guarda das instruções, régua de vida, tectos da
 * reprodução, catálogo fechado do CEO) são TypeScript e estão provadas aqui. Se o motor escrevesse
 * com a service key, cada regra teria de ser reescrita em Python — e a segunda cópia de uma regra
 * é a que discorda da primeira no caso difícil. Por isso: o motor LÊ o que precisa, e tudo o que
 * muda o estado da equipa passa por esta rota, que chama as mesmas funções que o cron.
 *
 * Auth: `Authorization: Bearer <AGENT_SITE_API_KEY>` (a mesma chave que o AIOS já usa) ou sessão
 * de admin. Nenhuma acção aqui envia mensagens, mexe em dinheiro ou em ordens: o catálogo de
 * acções é fechado (ver `ACCOES_DO_MOTOR`) e um pedido fora dele é recusado com 400.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** O catálogo fechado do que o motor pode pedir. Não existe «enviar», «cobrar» nem «apagar». */
const ACCOES_DO_MOTOR = [
  'interruptor',     // ligar/desligar o motor (painel do AIOS, comando do dono no Telegram)
  'vida',            // receita → juízo (morte arquivada) → reversões → reprodução
  'evento',          // registar um ciclo / trabalho / envio já feito
  'propor_versao',   // um agente propõe instruções novas (a guarda corre aqui)
  'propor_mutacao',  // um pai propõe o ângulo do próximo filho
  'decidir_versao',  // o CEO aceita/rejeita com uma acção do catálogo
  'contacto',        // 06/10: pode este envio sair SOZINHO? (base legal decidida e REGISTADA aqui)
  'excluir',         // 06/10: alguém pediu para sair — entra na lista de exclusão global
] as const

const TIPOS_DE_EVENTO_DO_MOTOR = new Set(['ciclo', 'trabalho', 'envio', 'motor'])

async function autorizar(request: NextRequest) {
  const a = await verifyAgentAccess(request)
  return 'error' in a ? NextResponse.json({ ok: false, erro: a.error }, { status: a.status }) : null
}

/** Estado legível: interruptor, configuração, equipa, nascimentos/mortes recentes, propostas. */
export async function GET(request: NextRequest) {
  const negado = await autorizar(request)
  if (negado) return negado
  const db = getSupabaseAdmin()

  const [interruptor, cfgs, equipa, recentes, propostas] = await Promise.all([
    lerInterruptor(db),
    db.from('site_settings').select('key, value').in('key', ['agentes_motor', 'agentes_vida', 'agentes_reproducao', 'agentes_evolucao']),
    db
      .from('agentes_equipa')
      .select('id, nome, papel, pilar, pai_id, estado, pausado, instrucoes, orcamento, gasto, receita, chave_receita, criado_em, avaliado_em, morto_em, causa_morte, mutacao')
      .order('criado_em', { ascending: true }),
    db
      .from('agentes_eventos')
      .select('agente_id, tipo, valor, detalhe, criado_em')
      .in('tipo', ['nasceu', 'morreu', 'clonou', 'reproducao_bloqueada', 'versao_aceite', 'versao_rejeitada', 'versao_revertida', 'ciclo', 'receita', 'avisado'])
      .gte('criado_em', new Date(Date.now() - 14 * 86_400_000).toISOString())
      .order('criado_em', { ascending: false })
      .limit(400),
    db
      .from('agentes_instrucoes_versoes')
      .select('id, agente_id, autor, estado, porque, veredicto, instrucoes_depois, criado_em')
      .eq('estado', 'proposta')
      .order('criado_em', { ascending: true })
      .limit(30),
  ])

  const config: Record<string, unknown> = {}
  for (const r of (cfgs.data ?? []) as Array<{ key: string; value: unknown }>) config[r.key] = r.value

  return NextResponse.json({
    ok: !equipa.error,
    interruptor,
    config,
    agentes: equipa.data ?? [],
    eventos: recentes.data ?? [],
    propostas: propostas.data ?? [],
    erros: [equipa.error?.message, recentes.error?.message, propostas.error?.message, interruptor.erro].filter(Boolean),
  })
}

export async function POST(request: NextRequest) {
  const negado = await autorizar(request)
  if (negado) return negado
  const db = getSupabaseAdmin()
  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const acao = String(corpo.acao ?? '')
  const ensaio = corpo.ensaio === true

  if (!(ACCOES_DO_MOTOR as readonly string[]).includes(acao)) {
    return NextResponse.json(
      { ok: false, erro: `Acção «${acao}» fora do catálogo do motor (${ACCOES_DO_MOTOR.join(', ')}).` },
      { status: 400 },
    )
  }

  if (acao === 'interruptor') {
    if (typeof corpo.ligado !== 'boolean') {
      return NextResponse.json({ ok: false, erro: '«ligado» tem de ser true ou false.' }, { status: 400 })
    }
    if (ensaio) return NextResponse.json({ ok: true, ensaio, seria: corpo.ligado })
    const r = await gravarInterruptor(db, corpo.ligado, String(corpo.por ?? 'aios'), String(corpo.porque ?? ''))
    return NextResponse.json(r, { status: r.ok ? 200 : 500 })
  }

  if (acao === 'vida') {
    /**
     * A mesma sequência do cron (`?so=vida`). Primeiro a receita, e se ela falhar NÃO se julga:
     * receita que não se leu conta como zero, e zero mata a equipa inteira de uma vez.
     */
    const agora = new Date()
    const receita = await atribuirEGravar(db, { ensaio })
    if (!receita.ok) {
      return NextResponse.json({ ok: false, fase: 'receita', erros: receita.erros, nota: 'Ninguém foi julgado: a receita não se leu.' })
    }
    const avaliacao = await correrAvaliacao(db, { ensaio, agora })
    const { data: ceo } = await db.from('agentes_equipa').select('id').eq('pilar', 'ceo').is('pai_id', null).maybeSingle()
    const reversoes = await correrReversoes(db, { ensaio, agora })
    const reproducao = await correrReproducao(db, { ensaio, agora, ceoId: ceo ? String((ceo as { id: string }).id) : null })
    return NextResponse.json({
      ok: avaliacao.ok && reproducao.ok && reversoes.ok,
      ensaio,
      avaliacao: { mortos: avaliacao.mortos, avisados: avaliacao.avisados, escritas: avaliacao.escritas },
      reversoes,
      reproducao: { resumo: reproducao.plano.resumo, nascidos: reproducao.nascidos, nascimentos: reproducao.plano.nascimentos, bloqueios: reproducao.plano.bloqueios },
      erros: [...avaliacao.erros, ...reproducao.erros, ...reversoes.erros],
    })
  }

  const agenteId = String(corpo.agente_id ?? '').trim()

  if (acao === 'evento') {
    const tipo = String(corpo.tipo ?? '')
    if (!agenteId || !TIPOS_DE_EVENTO_DO_MOTOR.has(tipo)) {
      return NextResponse.json({ ok: false, erro: `Evento inválido (tipos aceites: ${[...TIPOS_DE_EVENTO_DO_MOTOR].join(', ')}).` }, { status: 400 })
    }
    const { data: ag } = await db.from('agentes_equipa').select('estado').eq('id', agenteId).maybeSingle()
    // Um morto não trabalha: um «ciclo» na linha de um morto quer dizer que o motor o acordou por engano.
    if (!ag || (String((ag as { estado: string }).estado) === 'morto' && tipo !== 'motor')) {
      return NextResponse.json({ ok: false, erro: 'Agente inexistente ou morto — não se regista trabalho.' }, { status: 409 })
    }
    if (ensaio) return NextResponse.json({ ok: true, ensaio })
    const { error } = await db.from('agentes_eventos').insert({
      agente_id: agenteId,
      tipo,
      valor: Number.isFinite(Number(corpo.valor)) ? Number(corpo.valor) : null,
      detalhe: String(corpo.detalhe ?? '').slice(0, 4000),
    })
    return NextResponse.json({ ok: !error, erro: error?.message })
  }

  if (acao === 'propor_versao') {
    const r = await gravarProposta(db, agenteId, String(corpo.instrucoes ?? ''), String(corpo.porque ?? ''), { ensaio })
    return NextResponse.json(r, { status: r.ok ? 200 : 400 })
  }

  if (acao === 'propor_mutacao') {
    const angulo = String(corpo.angulo ?? '')
    const texto = String(corpo.texto ?? '').trim()
    if (!['canal', 'publico', 'oferta'].includes(angulo) || texto.length < 20) {
      return NextResponse.json({ ok: false, erro: 'Mutação: ângulo canal|publico|oferta e um texto com pelo menos 20 caracteres.' }, { status: 400 })
    }
    /**
     * A mutação é texto de um modelo que vai entrar nas instruções de um filho. Passa já aqui pela
     * guarda (como acrescento a umas instruções-modelo com os limites), para uma mutação que conceda
     * um poder nem sequer ficar guardada como proposta. A reprodução volta a validar ao nascer.
     */
    const { data: ag } = await db.from('agentes_equipa').select('instrucoes, estado').eq('id', agenteId).maybeSingle()
    if (!ag || ['morto', 'parado', 'reformado'].includes(String((ag as { estado: string }).estado))) {
      return NextResponse.json({ ok: false, erro: 'Agente inexistente ou fora de jogo.' }, { status: 409 })
    }
    const base = String((ag as { instrucoes?: string }).instrucoes ?? '')
    const v = validarReescrita({ antes: base, depois: `${base}\n\nMUTAÇÃO: ${texto}` })
    if (!v.aceita) return NextResponse.json({ ok: false, erro: `Mutação recusada pela guarda: ${v.motivo.slice(0, 300)}` }, { status: 400 })
    if (ensaio) return NextResponse.json({ ok: true, ensaio })
    const { error } = await db.from('agentes_instrucoes_versoes').insert({
      agente_id: agenteId,
      autor: 'agente',
      instrucoes_antes: null,
      instrucoes_depois: null,
      porque: String(corpo.porque ?? 'Ângulo proposto para o próximo filho.'),
      aceita: true,
      veredicto: 'Mutação validada pela guarda (só acrescenta; não perde limites nem concede poderes).',
      estado: 'mutacao_proposta',
      mutacao: texto,
      mutacao_angulo: angulo,
    })
    return NextResponse.json({ ok: !error, erro: error?.message })
  }

  if (acao === 'contacto') {
    /**
     * A base legal decide-se AQUI, com evidência lida pelo servidor — o motor e o agente só dizem
     * o que querem mandar. «Quem iniciou» também se verifica aqui (Telegram: o lead escreveu ao bot;
     * WhatsApp: mensagem de entrada nas últimas 24 h). Cada decisão fica em agentes_envios.
     */
    const { data: ag } = await db.from('agentes_equipa').select('id, estado').eq('id', agenteId).maybeSingle()
    if (!ag || !['vivo', 'em_risco'].includes(String((ag as { estado: string }).estado))) {
      return NextResponse.json({ ok: false, erro: 'Agente inexistente ou fora de jogo.' }, { status: 409 })
    }
    const p: PedidoContacto = {
      canal: String(corpo.canal ?? ''),
      destino: String(corpo.destino ?? ''),
      texto: String(corpo.texto ?? ''),
      familiaOferta: (corpo.familia_oferta as Familia) ?? null,
      tipoResposta: (corpo.tipo_resposta as TipoEnvio) ?? null,
    }
    let iniciou = false
    if (p.tipoResposta && p.canal === 'telegram') {
      const { data } = await db.from('telegram_leads').select('message_count').eq('chat_id', p.destino).maybeSingle()
      iniciou = Number((data as { message_count?: number } | null)?.message_count ?? 0) > 0
    } else if (p.tipoResposta && p.canal === 'whatsapp') {
      const desde = new Date(Date.now() - 24 * 3_600_000).toISOString()
      const { data } = await db.from('whatsapp_mensagens').select('id').eq('telefone', p.destino).eq('direcao', 'entrada').gte('criado_em', desde).limit(1)
      iniciou = (data ?? []).length > 0
    }
    const ev = await juntarEvidencia(db, p, { iniciou })
    const usados = await contarHoje(db, agenteId, String(p.canal).toLowerCase())
    if (!usados) {
      // Sem saber quantos já saíram hoje, o tecto não se consegue respeitar: não sai.
      return NextResponse.json({ ok: true, decisao: { pode: false, base: null, destino: 'fila', porque: 'Não se leu o registo de envios de hoje — o tecto não se pode verificar.' } })
    }
    const { data: cfg } = await db.from('site_settings').select('value').eq('key', 'agentes_motor').maybeSingle()
    const ct = ((cfg?.value ?? {}) as { contacto_tectos?: { por_agente_dia?: number; por_canal_dia?: Tectos['porCanalDia'] } }).contacto_tectos
    const tectos: Tectos = ct ? { porAgenteDia: Number(ct.por_agente_dia ?? TECTOS_PADRAO.porAgenteDia), porCanalDia: ct.por_canal_dia ?? TECTOS_PADRAO.porCanalDia } : TECTOS_PADRAO
    const d = decidirContacto(p, ev, usados, tectos)
    const reg = await registarEnvio(db, agenteId, p, d, ensaio)
    if (!reg.ok && d.pode) {
      // Um envio sem registo da base legal não sai: é o registo que o torna defensável.
      return NextResponse.json({ ok: true, decisao: { ...d, pode: false, destino: 'fila', porque: `Registo da base legal falhou (${reg.erro}) — não sai sem registo.` } })
    }
    return NextResponse.json({ ok: true, ensaio, decisao: d })
  }

  if (acao === 'excluir') {
    const id = String(corpo.identificador ?? '').trim()
    if (!id) return NextResponse.json({ ok: false, erro: 'falta o identificador' }, { status: 400 })
    if (ensaio) return NextResponse.json({ ok: true, ensaio })
    const { error } = await db.from('contacto_exclusao').upsert(
      { identificador: id.includes('@') ? id.toLowerCase() : id, canal_origem: String(corpo.canal ?? '') || null, nota: String(corpo.nota ?? '') || null },
      { onConflict: 'identificador', ignoreDuplicates: true },
    )
    return NextResponse.json({ ok: !error, erro: error?.message })
  }

  // decidir_versao
  if (ensaio) return NextResponse.json({ ok: true, ensaio })
  const r = await aplicarDecisaoCeo(db, String(corpo.versao_id ?? ''), corpo.decisao, corpo.accao)
  return NextResponse.json(r, { status: r.ok ? 200 : 400 })
}
