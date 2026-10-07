/**
 * O CEO COMO MOTOR ECONÓMICO (OS v2, 07/10/2026) — puro.
 *
 * Em cada ciclo o CEO recebe o P&L (`montarPnl`) e o GARGALO (`gargalo`) e responde com acções do
 * catálogo FECHADO `ACCOES_CEO`. A pergunta-guia: «qual é o melhor uso do próximo € e dos próximos
 * 10 minutos?». FIND → TEST → CLONE → SCALE → MUTATE → KILL.
 *
 * Nenhuma acção do CEO mexe em dinheiro, ordens, permissões, apaga dados ou faz merge — isso é a
 * FILA HUMANA (`categoriaHumana`). Arquivar é reversível (o dono restaura) e nunca toca no CEO.
 */

export const ACCOES_CEO = ['criar_missao', 'alocar_recursos', 'escalar', 'arquivar', 'suspender', 'retomar', 'fechar_missao'] as const
export type AccaoCeo = (typeof ACCOES_CEO)[number]

/**
 * HUMAN REQUIRED — o que chega ao dono. Tudo o resto, dentro dos guardrails, a IA executa.
 * (A mesma lista vive em motor/regras.py `CATEGORIAS_HUMANAS`; a guarda das duas compara-as.)
 */
export const CATEGORIAS_HUMANAS = [
  'juridico',            // decisão jurídica, contratos, termos
  'propriedade',         // marca, domínios, contas, IP
  'credenciais',         // passwords, chaves, tokens, OAuth
  'dinheiro_clientes',   // mover dinheiro de clientes, reembolsos, preços, Stripe
  'trading',             // ordens, execução, MetaApi/CopyFactory, sinais em conta real
  'apagar',              // apagar dados de forma irreversível
  'permissoes',          // roles, admin, acessos
  'merge',               // código para produção
  'regulatorio',         // aprovação regulatória
  'api_impossivel',      // o que nenhuma API permite (o dono faz à mão)
  'conflito_politica',   // duas regras da casa em conflito
  'estrategia',          // decisão estratégica extraordinária
  'gasto_pago',          // 1.ª activação de um canal pago ou aumento do tecto mensal
] as const
export type CategoriaHumana = (typeof CATEGORIAS_HUMANAS)[number]

const PALAVRAS: Array<[CategoriaHumana, RegExp]> = [
  ['dinheiro_clientes', /\b(stripe|reembols|refund|pre[cç]o|price|cobran|transfer|pagamento|saldo d[oe] cliente|levantamento)/i],
  ['trading', /\b(ordens? de (compra|venda|mercado)|trading real|conta real|metaapi|copyfactory|abrir posi|fechar posi|alavanc|executar (o |os )?sina)/i],
  ['apagar', /\b(apagar|delete|drop table|truncate|eliminar dados|purge)/i],
  ['permissoes', /\b(permiss|roles?\b|dar admin|tornar admin|acesso de admin|privil[eé]g)/i],
  ['credenciais', /\b(password|palavra-passe|credencia|token|api key|chave api|oauth)/i],
  ['merge', /\b(merge|push para main|deploy para produ)/i],
  ['juridico', /\b(jur[ií]dic|contrato|advogad|termos e condi|rgpd.*decis)/i],
  ['propriedade', /\b(dom[ií]nio|marca registada|propriedade|conta da empresa)/i],
  ['regulatorio', /\b(cmvm|regulat|licen[cç]a financeira|autoriza[cç][aã]o regul)/i],
  ['gasto_pago', /\b(an[uú]ncios? pago|ads pag|meta ads|google ads|campanha paga|or[cç]amento pago|comprar (ferramenta|software|leads|lista)|subscrever ferramenta|aumentar o tecto)/i],
]

/** A categoria humana de um pedido, ou null (= a IA executa dentro dos guardrails). */
export function categoriaHumana(texto: string, categoriaDeclarada?: string | null): CategoriaHumana | null {
  if (categoriaDeclarada && (CATEGORIAS_HUMANAS as readonly string[]).includes(categoriaDeclarada)) return categoriaDeclarada as CategoriaHumana
  for (const [cat, re] of PALAVRAS) if (re.test(texto)) return cat
  return null
}

// ── P&L e gargalo ─────────────────────────────────────────────────────────────────────────

export interface EntradaPnl {
  receita7dEur: number
  receita30dEur: number
  receitaAtribuida7dEur: number
  vendas7d: number
  clientesNovos7d: number
  ciclos7d: number
  custoCicloEur: number
  gastoPago7dEur: number
  leads7d: number
  funil: Record<string, number>
  envios7d: number
  respostas7d: number
  errosCiclo7d: number
  objectivoMensalEur: number
  diaDoMes: number
  diasNoMes: number
  agentes: Array<{ codigo: string; ciclo: string; proof: number | null; banda: string | null; valorMarginal: number; familia: string | null }>
  quota: { capacidade: number; usadosHoje: number; limiteBatido24h: boolean } | null
}

export interface Pnl {
  receita7dEur: number
  receita30dEur: number
  custoQuota7dEur: number
  gastoPago7dEur: number
  margem7dEur: number
  margemPct: number | null
  cacEur: number | null
  conversao: number | null
  taxaResposta: number | null
  ritmoObjectivo: { esperadoAteHojeEur: number; feitoEur: number; desvioEur: number }
  gargalo: { etapa: string; porque: string }
  porEstado: Record<string, number>
  topProof: Array<{ codigo: string; proof: number | null; banda: string | null }>
  quota: EntradaPnl['quota']
  pergunta: string
}

const r2 = (x: number) => Number(x.toFixed(2))

/**
 * O GARGALO — a etapa do funil com pior relação, por ordem: sem leads → sem respostas → sem
 * marcações → sem fecho → sem retenção. Puro e explicado.
 */
export function gargalo(e: EntradaPnl): { etapa: string; porque: string } {
  if (e.quota?.limiteBatido24h) return { etapa: 'quota', porque: 'A subscrição bateu no limite nas últimas 24 h: menos ciclos, só os de maior Proof.' }
  if (e.leads7d < 10) return { etapa: 'leads', porque: `Só ${e.leads7d} leads novos em 7 dias: o topo do funil está seco (pipeline, radar, B2B de páginas públicas, opt-ins).` }
  if (e.envios7d >= 20 && e.respostas7d / Math.max(1, e.envios7d) < 0.02) return { etapa: 'resposta', porque: `${e.respostas7d} respostas em ${e.envios7d} contactos (< 2 %): hook/CTA/público errados.` }
  const marcados = (e.funil.marcado ?? 0) + (e.funil.apresentado ?? 0)
  const qualificados = e.funil.qualificado ?? 0
  if (qualificados >= 5 && marcados / Math.max(1, qualificados) < 0.2) return { etapa: 'marcacao', porque: `${qualificados} qualificados e ${marcados} marcados: falta passar à chamada (/agendar).` }
  if (marcados >= 3 && e.vendas7d === 0) return { etapa: 'fecho', porque: `${marcados} marcados/apresentados e 0 vendas em 7 dias: o fecho está a falhar.` }
  if (e.receitaAtribuida7dEur === 0 && e.receita7dEur > 0) return { etapa: 'atribuicao', porque: 'Há receita mas 0 € atribuídos a agentes: links sem ?ag=.' }
  return { etapa: 'escala', porque: 'O funil passa: o gargalo é escala — clonar/escalar quem tem Proof e amostra.' }
}

export function montarPnl(e: EntradaPnl): Pnl {
  const custo = r2(e.ciclos7d * e.custoCicloEur)
  const margem = r2(e.receita7dEur - custo - e.gastoPago7dEur)
  const esperado = r2((e.objectivoMensalEur * e.diaDoMes) / Math.max(1, e.diasNoMes))
  const porEstado: Record<string, number> = {}
  for (const a of e.agentes) porEstado[a.ciclo] = (porEstado[a.ciclo] ?? 0) + 1
  return {
    receita7dEur: r2(e.receita7dEur),
    receita30dEur: r2(e.receita30dEur),
    custoQuota7dEur: custo,
    gastoPago7dEur: r2(e.gastoPago7dEur),
    margem7dEur: margem,
    margemPct: e.receita7dEur > 0 ? r2((100 * margem) / e.receita7dEur) : null,
    cacEur: e.clientesNovos7d > 0 ? r2((custo + e.gastoPago7dEur) / e.clientesNovos7d) : null,
    conversao: e.leads7d > 0 ? r2(e.vendas7d / e.leads7d) : null,
    taxaResposta: e.envios7d > 0 ? r2(e.respostas7d / e.envios7d) : null,
    ritmoObjectivo: { esperadoAteHojeEur: esperado, feitoEur: r2(e.receita30dEur), desvioEur: r2(e.receita30dEur - esperado) },
    gargalo: gargalo(e),
    porEstado,
    topProof: [...e.agentes].sort((a, b) => (b.proof ?? -1) - (a.proof ?? -1)).slice(0, 5).map((a) => ({ codigo: a.codigo, proof: a.proof, banda: a.banda })),
    quota: e.quota,
    pergunta: 'Qual é o melhor uso do próximo € e dos próximos 10 minutos?',
  }
}

// ── Validação das acções do CEO ──────────────────────────────────────────────────────────

export interface AlvoAgente {
  id: string
  codigo: string
  ceo: boolean
  ciclo: string
  proof: number | null
  banda: string | null
  amostraOk: boolean
}

export interface DecisaoCeo {
  ok: boolean
  motivo: string
  /** O que escrever (intenção). */
  efeito?: Record<string, unknown>
}

export function validarAccaoCeo(
  accao: string,
  p: Record<string, unknown>,
  ctx: { alvo?: AlvoAgente | null; capacidadeLivreCiclosDia: number; ciclosPorWorkerDia: number; missaoAberta?: boolean },
): DecisaoCeo {
  if (!(ACCOES_CEO as readonly string[]).includes(accao)) return { ok: false, motivo: `Acção «${accao}» fora do catálogo do CEO (${ACCOES_CEO.join(', ')}).` }
  const texto = JSON.stringify(p ?? {})
  const humano = categoriaHumana(texto)
  if (humano) return { ok: false, motivo: `Pedido toca em «${humano}»: é da fila humana, não do CEO.` }
  const alvo = ctx.alvo ?? null

  switch (accao as AccaoCeo) {
    case 'criar_missao': {
      const titulo = String(p.titulo ?? '').trim()
      const n = Math.floor(Number(p.workers ?? 1))
      if (titulo.length < 5) return { ok: false, motivo: 'Missão sem título.' }
      if (!String(p.kpi ?? '').trim()) return { ok: false, motivo: 'Missão sem KPI medido (o que conta como resultado).' }
      if (!Number.isFinite(n) || n < 0) return { ok: false, motivo: 'Nº de workers inválido.' }
      const cabem = Math.floor(Math.max(0, ctx.capacidadeLivreCiclosDia) / Math.max(1, ctx.ciclosPorWorkerDia))
      const aprovados = Math.min(n, cabem, 10)
      return {
        ok: true,
        motivo: aprovados < n ? `Pedidos ${n} workers; a quota livre só deixa ${aprovados}.` : `${aprovados} worker(s) aprovados pela quota.`,
        efeito: { workers_pedidos: n, workers_aprovados: aprovados },
      }
    }
    case 'alocar_recursos': {
      if (!alvo) return { ok: false, motivo: 'Agente alvo inexistente.' }
      const m = Number(p.mult)
      if (!Number.isFinite(m) || m < 0.25 || m > 3) return { ok: false, motivo: 'mult entre 0,25 e 3.' }
      if (alvo.ciclo === 'ARCHIVED') return { ok: false, motivo: 'Arquivado: não recebe recursos.' }
      return { ok: true, motivo: `Recursos de ${alvo.codigo} × ${m}.`, efeito: { recursos_mult: m } }
    }
    case 'escalar': {
      if (!alvo) return { ok: false, motivo: 'Agente alvo inexistente.' }
      if (alvo.ceo) return { ok: false, motivo: 'O CEO não se clona.' }
      if (!alvo.amostraOk) return { ok: false, motivo: `Sem amostra mínima (proof ${alvo.proof ?? '—'}): uma venda isolada não clona.` }
      if ((alvo.proof ?? 0) < 70) return { ok: false, motivo: `Proof ${alvo.proof} < 70 (candidato): não se escala.` }
      return { ok: true, motivo: `Clonagem validada pelo CEO para ${alvo.codigo} (proof ${alvo.proof}).`, efeito: { clonagem_validada: true, modo: p.modo === 'recursos' ? 'recursos' : 'clonar' } }
    }
    case 'arquivar': {
      if (!alvo) return { ok: false, motivo: 'Agente alvo inexistente.' }
      if (alvo.ceo) return { ok: false, motivo: 'O CEO é imortal: não se arquiva.' }
      if (alvo.ciclo === 'ARCHIVED') return { ok: false, motivo: 'Já está arquivado.' }
      if ((alvo.proof ?? 0) >= 70 && alvo.amostraOk) return { ok: false, motivo: `Proof ${alvo.proof} com amostra: cria valor — arquivar é decisão do dono.` }
      if (String(p.porque ?? '').trim().length < 10) return { ok: false, motivo: 'Arquivar exige o porquê medido.' }
      return { ok: true, motivo: `Arquivar ${alvo.codigo} (reversível, nada se apaga).`, efeito: { ciclo: 'ARCHIVED' } }
    }
    case 'suspender':
    case 'retomar': {
      if (!alvo) return { ok: false, motivo: 'Agente alvo inexistente.' }
      if (alvo.ceo) return { ok: false, motivo: 'O CEO não se suspende a si próprio.' }
      if (alvo.ciclo === 'ARCHIVED') return { ok: false, motivo: 'Arquivado: só o dono restaura.' }
      return { ok: true, motivo: `${accao} ${alvo.codigo}.`, efeito: { ciclo: accao === 'suspender' ? 'SUSPENDED' : 'ACTIVE' } }
    }
    case 'fechar_missao':
      return ctx.missaoAberta ? { ok: true, motivo: 'Missão fechada: os workers passam a IDLE.', efeito: { estado: 'concluida' } } : { ok: false, motivo: 'Missão inexistente ou já fechada.' }
  }
  return { ok: false, motivo: 'sem regra' }
}
