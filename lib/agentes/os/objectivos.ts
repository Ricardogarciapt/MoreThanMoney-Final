/**
 * MTM AUTONOMOUS OS v2 — OBJECTIVOS, RECURSOS E TECTOS DUROS (decisão do dono, 07/10/2026).
 *
 * Dois tipos de número vivem aqui, e não se misturam:
 *
 *  · os TECTOS DUROS EXTERNOS (`TECTOS_DUROS`): limites que vêm de fora da casa — regras das
 *    plataformas (Meta, Google/Gmail, WhatsApp), a quota da subscrição do Claude, a lei. São
 *    constantes de CÓDIGO: nenhum setting, nenhum agente e nenhum cálculo os passa. O dono pode
 *    BAIXÁ-LOS em `os_objectivos.tectos` (nunca subir: `min` com a constante);
 *  · os OBJECTIVOS E RECURSOS (`site_settings.os_objectivos`): o que o dono quer (receita do mês),
 *    o que deixa gastar (orçamento pago — só proposta), a margem mínima e os canais. É daqui que o
 *    CEO lê «o melhor uso do próximo € e dos próximos 10 minutos».
 *
 * Arranque (decisão do dono, 07/10): só ORGÂNICO. Orçamento pago = 0 e nenhum canal pago activo. A
 * primeira activação de um canal pago e qualquer aumento do tecto mensal são do dono; os agentes
 * não têm ferramenta de compra.
 */

export type CanalContacto = 'email' | 'sms' | 'whatsapp' | 'telegram' | 'instagram' | 'chamada' | 'linkedin'

/**
 * TECTOS DUROS EXTERNOS — por dia, salvo indicação. Ficam SEMPRE abaixo do limite publicado pela
 * plataforma (margem de segurança), e são a última palavra de qualquer orçamento dinâmico.
 *
 *  · email (Gmail): o Gmail limita contas a centenas de envios/dia e as regras de remetentes em massa
 *    da Google (2024) pedem queixas abaixo de 0,3 %. A casa fica em 400/dia no total e 50/dia no B2B
 *    (o código do B2B já tinha 50 como máximo duro);
 *  · whatsapp: a conta verificada tem 250 conversas iniciadas pela empresa por 24 h (medido 04/10);
 *    iniciar só com template + opt-in;
 *  · instagram DM: só resposta dentro da janela de 24 h de quem escreveu (regra da Meta); tecto da
 *    casa 100/dia;
 *  · instagram publicação: a API da Meta limita publicações por conta em 24 h (dezenas); a casa fica
 *    em 6 posts e 10 histórias por conta e dia;
 *  · telegram: um bot só escreve a quem lhe escreveu; tecto da casa 300/dia;
 *  · linkedin: ZERO, sempre (lei da casa: nada de automação no LinkedIn);
 *  · claude -p: a quota da subscrição. 06/10 bateu no limite de sessão («You've hit your session
 *    limit») com rajada; 07/10 fez 152 ciclos em 14,7 h sem bater. O tecto duro é 600/dia e o dono
 *    pode baixá-lo; o valor de cada dia é dinâmico (motor/regras.py `capacidade_ciclos`).
 */
export const TECTOS_DUROS = {
  contactoPorCanalDia: {
    email: 150,
    sms: 50,
    whatsapp: 250,
    telegram: 300,
    instagram: 100,
    chamada: 20,
    linkedin: 0,
  } as Record<CanalContacto, number>,
  contactoPorAgenteDia: 200,
  emailTotalDia: 400,
  b2bDia: 50,
  postsDiaConta: 6,
  historiasDiaConta: 10,
  pipelinePorAgenteDia: 150,
  claudeCiclosDia: 600,
  /** Workers por missão: sanidade; o limite real é a quota (ver `capacidade`). */
  workersPorMissao: 10,
  /** Clones por ninhada. */
  clonesPorNinhada: 6,
} as const

/** Os valores fixos ANTIGOS (até 07/10). Passam a ser o CHÃO SEGURO quando não há dados. */
export const CHAO_SEGURO = {
  contactoPorAgenteDia: 40,
  contactoPorCanalDia: { email: 30, sms: 10, whatsapp: 15, telegram: 30, instagram: 15, chamada: 10, linkedin: 0 } as Record<CanalContacto, number>,
  b2bDia: 20,
  postsDiaConta: 2,
  historiasDiaConta: 1,
  pipelinePorAgenteDia: 40,
  claudeCiclosDia: 260,
  claudeCiclosAgenteDia: 24,
} as const

export interface Objectivos {
  receitaMensalEur: number
  /** Orçamento PAGO por mês, em euros. Só proposta: o sistema propõe alocação, o dono activa. */
  orcamentoPagoMensalEur: number
  /** Tecto do orçamento pago: só o dono o sobe (fila humana). */
  tectoPagoMensalEur: number
  margemMinimaPct: number
  canaisOrganicos: string[]
  canaisPagosActivos: string[]
  /** «organico_primeiro»: leads existentes → listas novas com base legal → (pago só com o dono). */
  regra: string
  listasNovasPermitidas: string[]
  recursos: {
    /** Custo mensal da subscrição usada pelo claude -p (para o custo de oportunidade por ciclo). */
    custoSubscricaoMensalEur: number
    /** O dono pode baixar o tecto duro da quota (nunca subir acima de TECTOS_DUROS.claudeCiclosDia). */
    claudeCiclosDiaMax: number
  }
  /** Tectos que o dono baixou (nunca sobe: `min` com TECTOS_DUROS). */
  tectos: Partial<{ emailTotalDia: number; b2bDia: number; postsDiaConta: number; contactoPorAgenteDia: number }>
}

export const OBJECTIVOS_PADRAO: Objectivos = {
  receitaMensalEur: 3000,
  orcamentoPagoMensalEur: 0,
  tectoPagoMensalEur: 0,
  margemMinimaPct: 60,
  canaisOrganicos: ['instagram_organico', 'telegram', 'email_soft_opt_in', 'email_b2b', 'whatsapp_resposta', 'pipeline'],
  canaisPagosActivos: [],
  regra: 'organico_primeiro',
  listasNovasPermitidas: ['b2b_paginas_publicas', 'optin_formularios', 'ex_clientes_soft_opt_in'],
  recursos: { custoSubscricaoMensalEur: 200, claudeCiclosDiaMax: 400 },
  tectos: {},
}

/** As listas que NUNCA entram, mesmo que o setting as ponha: listas compradas de particulares. */
export const LISTAS_PROIBIDAS = ['listas_compradas', 'particulares_sem_consentimento', 'linkedin', 'scraping_redes_sociais'] as const

function obj(v: unknown): Record<string, unknown> {
  try {
    const o = typeof v === 'string' ? JSON.parse(v) : v
    return o && typeof o === 'object' ? (o as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const numero = (x: unknown, d: number, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const n = Number(x)
  return Number.isFinite(n) && n >= min ? Math.min(max, n) : d
}

/**
 * Lê `os_objectivos` com tolerância. Regras que um setting NÃO consegue mudar:
 *  · canais pagos activos só existem se o orçamento pago > 0 (e mesmo assim a activação é do dono);
 *  · listas proibidas saem sempre da lista de listas novas;
 *  · `claudeCiclosDiaMax` e os tectos do dono nunca passam os TECTOS_DUROS.
 */
export function lerObjectivos(valor: unknown): Objectivos {
  const v = obj(valor)
  const d = OBJECTIVOS_PADRAO
  const rec = obj(v.recursos)
  const tect = obj(v.tectos)
  const pago = numero(v.orcamento_pago_mensal_eur, d.orcamentoPagoMensalEur)
  const tectoPago = numero(v.tecto_pago_mensal_eur, d.tectoPagoMensalEur)
  const lista = (x: unknown, dd: string[]) => (Array.isArray(x) ? x.map(String).filter(Boolean) : dd)
  const tectosDono: Objectivos['tectos'] = {}
  for (const [k, max] of [
    ['emailTotalDia', TECTOS_DUROS.emailTotalDia],
    ['b2bDia', TECTOS_DUROS.b2bDia],
    ['postsDiaConta', TECTOS_DUROS.postsDiaConta],
    ['contactoPorAgenteDia', TECTOS_DUROS.contactoPorAgenteDia],
  ] as const) {
    const snake = k.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())
    if (tect[snake] !== undefined) tectosDono[k] = Math.min(max, numero(tect[snake], max))
  }
  return {
    receitaMensalEur: numero(v.receita_mensal_eur, d.receitaMensalEur),
    // O orçamento proposto nunca passa o tecto que o dono aprovou.
    orcamentoPagoMensalEur: Math.min(pago, tectoPago),
    tectoPagoMensalEur: tectoPago,
    margemMinimaPct: numero(v.margem_minima_pct, d.margemMinimaPct, 0, 100),
    canaisOrganicos: lista(v.canais_organicos, d.canaisOrganicos),
    canaisPagosActivos: Math.min(pago, tectoPago) > 0 ? lista(v.canais_pagos_activos, []) : [],
    regra: typeof v.regra === 'string' && v.regra ? v.regra : d.regra,
    listasNovasPermitidas: lista(v.listas_novas_permitidas, d.listasNovasPermitidas).filter(
      (l) => !(LISTAS_PROIBIDAS as readonly string[]).includes(l),
    ),
    recursos: {
      custoSubscricaoMensalEur: numero(rec.custo_subscricao_mensal_eur, d.recursos.custoSubscricaoMensalEur),
      claudeCiclosDiaMax: Math.min(TECTOS_DUROS.claudeCiclosDia, numero(rec.claude_ciclos_dia_max, d.recursos.claudeCiclosDiaMax, 1)),
    },
    tectos: tectosDono,
  }
}

/** O valor por omissão gravado pela migração 202 (snake_case, como os outros settings da casa). */
export const OS_OBJECTIVOS_SETTING = {
  receita_mensal_eur: 3000,
  orcamento_pago_mensal_eur: 0,
  tecto_pago_mensal_eur: 0,
  margem_minima_pct: 60,
  canais_organicos: OBJECTIVOS_PADRAO.canaisOrganicos,
  canais_pagos_activos: [],
  regra: 'organico_primeiro',
  listas_novas_permitidas: OBJECTIVOS_PADRAO.listasNovasPermitidas,
  recursos: { custo_subscricao_mensal_eur: 200, claude_ciclos_dia_max: 400 },
  tectos: {},
}
