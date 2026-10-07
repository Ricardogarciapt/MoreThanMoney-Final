/**
 * CONTACTO POR INICIATIVA DOS AGENTES — quando é que um agente pode ESCREVER PRIMEIRO, sem fila.
 *
 * ═══ A DECISÃO DO DONO (06/10/2026), DENTRO DA LEI ═════════════════════════════════════════
 *
 * Os agentes podem iniciar contacto sozinhos, sem passar pela fila, por TRÊS bases legais — e por
 * mais nenhuma:
 *
 *  · `soft_opt_in` — clientes e ex-clientes, sobre produtos SEMELHANTES aos que compraram, com
 *    forma de sair em cada mensagem (Lei 41/2004, art. 13.º-A, n.º 3; ePrivacy art. 13(2)). Só
 *    nos canais de «correio electrónico» da lei: email, SMS e mensagens para uma conversa que o
 *    cliente já abriu com o bot de Telegram;
 *  · `consentimento` — quem tem consentimento GRAVADO para AQUELE canal (captacao_consentimento,
 *    não retirado) — RGPD art. 6(1)(a) + Lei 41/2004 art. 13.º-A, n.º 1;
 *  · `b2b` — email PROFISSIONAL de pessoa colectiva (domínio de empresa, nunca webmail pessoal),
 *    com a MTM identificada e forma de sair (Lei 41/2004 art. 13.º-A, n.º 2: o regime de opt-out
 *    aplica-se a pessoas colectivas).
 *
 * E, desde 07/10, o EMAIL DE SERVIÇO (`servico`) — não é marketing: é sobre o contrato da própria
 * pessoa (pagamento recusado, renovação, subscrição cancelada por falta de pagamento), só por email,
 * só a quem pagou ou tentou pagar esse produto (RGPD art. 6(1)(b), execução do contrato), e só
 * quando quem redige o declara (`natureza: 'servico'`). Uma oferta de OUTRO produto dentro dele
 * deixa de ser serviço e cai nas regras do marketing.
 *
 * A resposta a quem nos escreveu primeiro continua a sair sozinha, como já saía
 * (`lib/envios-aprovacao.ts::iniciadoPeloUtilizador`) — aqui chama-se `resposta`.
 *
 * ═══ O QUE CONTINUA BLOQUEADO PELO CÓDIGO (não vai à fila: não sai, ponto) ═════════════════
 *
 *  · particulares sem consentimento, por email, SMS, WhatsApp ou chamada (a chamada a
 *    consumidores exige opt-in prévio — Lei 41/2004, art. 13.º-A);
 *  · qualquer automação no LinkedIn (os termos proíbem);
 *  · WhatsApp fora de template aprovado + opt-in (regras da Meta: fora da janela de 24 h só
 *    template, e a política exige opt-in);
 *  · Instagram por iniciativa (a Meta não deixa abrir DMs a quem não escreveu);
 *  · quem está na LISTA DE EXCLUSÃO GLOBAL: pediu para sair UMA vez, em qualquer canal, e nunca
 *    mais é contactado em nenhum — esta regra vem ANTES de todas as outras, incluindo a resposta.
 *
 * Obrigatório em todos os envios que saem: tecto diário por agente E por canal, e a base legal
 * gravada no registo (`agentes_envios`). Dinheiro, trading e apagar dados não são envios — continuam
 * na fila do dono pelo catálogo do motor.
 *
 * PURO em cima (decide com a evidência que lhe dão), base de dados em baixo (junta a evidência e
 * regista). A guarda está em `contacto-inicial.check.ts`.
 */
import { iniciadoPeloUtilizador, type TipoEnvio } from '@/lib/envios-aprovacao'

export type Canal = 'email' | 'sms' | 'whatsapp' | 'telegram' | 'instagram' | 'chamada' | 'linkedin'
export type BaseLegal = 'resposta' | 'soft_opt_in' | 'consentimento' | 'b2b' | 'servico'

/** Famílias de produto — «semelhante» do soft opt-in mede-se por família, não por produto exacto. */
export type Familia = 'formacao' | 'sinais' | 'copy' | 'auto_t2t' | 'funded' | 'software'

/** O que o motor sabe da pessoa. Vem da base, NUNCA do agente. */
export interface Evidencia {
  /** A pessoa escreveu-nos primeiro neste canal (e é a ela que se responde). */
  iniciou?: boolean
  /** Pediu para sair em QUALQUER canal (lista de exclusão global). */
  excluido?: boolean
  /** Consentimento gravado para ESTE canal, não retirado. */
  consentimentoCanal?: boolean
  /** Famílias de produto que comprou (pagamento real, mesmo que já tenha saído). */
  familiasCompradas?: Familia[]
  /** Famílias de que teve CONTRATO: pagou ou tentou pagar (débito recusado conta). Só para `servico`. */
  familiasContrato?: Familia[]
  /** Email de domínio de empresa, verificado como pessoa colectiva (não webmail). */
  emailProfissional?: boolean
  /** WhatsApp: template aprovado pela Meta para esta mensagem. */
  templateAprovado?: boolean
  /** Telegram: a pessoa já abriu conversa com o bot (o bot não consegue escrever a quem nunca o abriu). */
  conversaBotAberta?: boolean
}

export interface PedidoContacto {
  canal: Canal | string
  destino: string
  texto: string
  /** A família do produto de que a mensagem fala. Obrigatória para o soft opt-in. */
  familiaOferta?: Familia | null
  /** Quando é resposta, o tipo da regra do site. */
  tipoResposta?: TipoEnvio | null
  /** `servico` = a mensagem é sobre o contrato da pessoa (pagamento, renovação), não uma oferta. */
  natureza?: 'servico' | null
}

export interface Tectos {
  /** Envios por iniciativa por agente por dia, em todos os canais. */
  porAgenteDia: number
  /** Por canal, por agente, por dia. */
  porCanalDia: Partial<Record<Canal, number>>
}

export const TECTOS_PADRAO: Tectos = {
  porAgenteDia: 40,
  porCanalDia: { email: 30, sms: 10, whatsapp: 15, telegram: 30, instagram: 15 },
}

export interface Decisao {
  pode: boolean
  base: BaseLegal | null
  porque: string
  /** Bloqueado pela lei/termos (não vai à fila) ou só por falta de base (vai à fila do dono). */
  destino: 'sai' | 'fila' | 'bloqueado'
}

/** Domínios de webmail pessoal: um endereço destes é de um PARTICULAR, nunca B2B. */
export const WEBMAIL = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.pt', 'outlook.com', 'outlook.pt', 'live.com',
  'live.com.pt', 'msn.com', 'yahoo.com', 'yahoo.com.br', 'yahoo.pt', 'icloud.com', 'me.com', 'mac.com',
  'sapo.pt', 'iol.pt', 'clix.pt', 'netcabo.pt', 'aol.com', 'gmx.com', 'gmx.net', 'proton.me',
  'protonmail.com', 'zoho.com', 'mail.com', 'yandex.com', 'uol.com.br', 'bol.com.br', 'terra.com.br',
])

export function eWebmail(email: string): boolean {
  const d = String(email ?? '').trim().toLowerCase().split('@')[1] ?? ''
  return !d || WEBMAIL.has(d)
}

/** A mensagem traz forma de sair? (link de saída, ou «responde SAIR/STOP»). */
export function temSaida(texto: string): boolean {
  return /(\bsair\b|\bstop\b|\bcancelar\s+subscri|\bdescadastr|\bunsubscribe\b|\bopt[- ]?out\b|\/sair\b|deixar\s+de\s+receber)/i.test(
    String(texto ?? ''),
  )
}

/** A mensagem identifica a MTM? (obrigatório no B2B, e boa prática em todos). */
export function identificaMtm(texto: string): boolean {
  return /more\s*than\s*money|morethanmoney\.pt|\bMTM\b/i.test(String(texto ?? ''))
}

function contado(n: number | undefined) {
  return Number.isFinite(Number(n)) ? Number(n) : 0
}

/**
 * A DECISÃO — pura. A ORDEM É A REGRA:
 *  1. exclusão global (vence tudo, incluindo responder);
 *  2. canais proibidos por termos (LinkedIn);
 *  3. tectos do dia (agente, canal);
 *  4. resposta a quem iniciou;
 *  5. as três bases de iniciativa, canal a canal;
 *  6. o resto: particular sem base → bloqueado pela lei (email/SMS/WhatsApp/chamada) ou fila.
 */
export function decidirContacto(
  p: PedidoContacto,
  ev: Evidencia,
  usados: { agenteHoje: number; canalHoje: number },
  tectos: Tectos = TECTOS_PADRAO,
): Decisao {
  const canal = String(p.canal ?? '').toLowerCase() as Canal
  const texto = String(p.texto ?? '')
  const bloq = (porque: string): Decisao => ({ pode: false, base: null, porque, destino: 'bloqueado' })

  if (!texto.trim() || !String(p.destino ?? '').trim()) return bloq('Sem texto ou sem destino.')

  // 1. Quem saiu, saiu de tudo.
  if (ev.excluido === true) return bloq('Na lista de exclusão global: pediu para sair — nunca mais é contactado, em canal nenhum.')

  // 2. Termos de plataforma.
  if (canal === 'linkedin') return bloq('LinkedIn: os termos proíbem automação. Nada sai por aqui sozinho.')

  // 3. Tectos.
  if (contado(usados.agenteHoje) >= tectos.porAgenteDia) {
    return { pode: false, base: null, porque: `Tecto diário do agente (${tectos.porAgenteDia}) atingido.`, destino: 'fila' }
  }
  const tCanal = tectos.porCanalDia[canal]
  if (tCanal === undefined || tCanal <= 0) {
    // Um canal sem tecto escrito não tem envio por iniciativa: a falta de número não é «sem limite».
    if (!(ev.iniciou === true && p.tipoResposta && iniciadoPeloUtilizador(p.tipoResposta))) {
      return bloq(`Canal «${canal}» sem tecto definido — não sai sozinho.`)
    }
  } else if (contado(usados.canalHoje) >= tCanal) {
    return { pode: false, base: null, porque: `Tecto diário do canal ${canal} (${tCanal}) atingido.`, destino: 'fila' }
  }

  // 4. Resposta a quem nos escreveu — a regra já existente do site.
  if (ev.iniciou === true && p.tipoResposta && iniciadoPeloUtilizador(p.tipoResposta)) {
    if (canal === 'whatsapp' || canal === 'instagram' || canal === 'telegram' || canal === 'email') {
      return { pode: true, base: 'resposta', porque: 'A pessoa escreveu primeiro — a resposta sai.', destino: 'sai' }
    }
  }

  // 5. Iniciativa.
  if (canal === 'instagram') return bloq('Instagram: a Meta não deixa abrir conversa a quem não escreveu.')

  if (canal === 'chamada') {
    // Chamada automática ou de marketing a consumidor: só com consentimento prévio para chamadas.
    return ev.consentimentoCanal === true
      ? { pode: true, base: 'consentimento', porque: 'Consentimento gravado para chamadas.', destino: 'sai' }
      : bloq('Chamada a particular sem consentimento prévio: proibido (opt-in obrigatório).')
  }

  if (canal === 'whatsapp') {
    if (ev.templateAprovado !== true) return bloq('WhatsApp por iniciativa só com template aprovado pela Meta.')
    if (ev.consentimentoCanal !== true) return bloq('WhatsApp por iniciativa exige opt-in gravado para WhatsApp.')
    if (!temSaida(texto)) return bloq('A mensagem tem de levar a forma de sair (ex.: «responde SAIR»).')
    return { pode: true, base: 'consentimento', porque: 'Template aprovado + opt-in de WhatsApp.', destino: 'sai' }
  }

  if (canal === 'telegram' && ev.conversaBotAberta !== true) {
    return bloq('Telegram: o bot só escreve a quem já abriu conversa com ele.')
  }

  // 5a. Email de serviço: sobre o contrato DELA, a quem pagou ou tentou pagar esse produto.
  if (canal === 'email' && p.natureza === 'servico') {
    const contrato = [...new Set([...(ev.familiasContrato ?? []), ...(ev.familiasCompradas ?? [])])]
    if (contrato.length === 0) return bloq('«Serviço» a quem nunca pagou nem tentou pagar: não há contrato — não é serviço.')
    if (p.familiaOferta && !contrato.includes(p.familiaOferta)) {
      return bloq(`«Serviço» que fala de ${p.familiaOferta}, e o contrato é de ${contrato.join('/')}: isso é oferta, não serviço.`)
    }
    return { pode: true, base: 'servico', porque: `Email de serviço sobre o contrato dela (${contrato.join('/')}).`, destino: 'sai' }
  }

  if (canal === 'email' || canal === 'sms' || canal === 'telegram') {
    const saida = temSaida(texto)
    if (ev.consentimentoCanal === true) {
      if (!saida) return bloq('Com consentimento, mas a mensagem não leva forma de sair — obrigatória.')
      return { pode: true, base: 'consentimento', porque: `Consentimento gravado para ${canal}.`, destino: 'sai' }
    }
    const comprou = ev.familiasCompradas ?? []
    if (comprou.length > 0) {
      if (!p.familiaOferta) {
        return { pode: false, base: null, porque: 'Cliente/ex-cliente, mas a mensagem não diz de que produto fala — o soft opt-in só cobre produtos semelhantes.', destino: 'fila' }
      }
      if (!comprou.includes(p.familiaOferta)) {
        return { pode: false, base: null, porque: `Cliente de ${comprou.join('/')}, e a oferta é de ${p.familiaOferta}: não é produto semelhante — vai à fila.`, destino: 'fila' }
      }
      if (!saida) return bloq('Soft opt-in exige forma de sair em CADA mensagem.')
      return { pode: true, base: 'soft_opt_in', porque: `Cliente/ex-cliente de ${p.familiaOferta}, produto semelhante, com saída.`, destino: 'sai' }
    }
    if (canal === 'email' && ev.emailProfissional === true && !eWebmail(p.destino)) {
      if (!identificaMtm(texto)) return bloq('B2B exige a MTM identificada na mensagem.')
      if (!saida) return bloq('B2B exige forma de sair.')
      return { pode: true, base: 'b2b', porque: 'Email profissional de pessoa colectiva, com identificação e saída.', destino: 'sai' }
    }
    return bloq(`Particular sem consentimento por ${canal}: proibido por lei (Lei 41/2004 / RGPD).`)
  }

  return bloq(`Canal «${canal}» desconhecido.`)
}

/** Família de um plano/pack, pelo nome. Puro. Desconhecido → null (e então não há soft opt-in). */
export function familiaDoPlano(plano: unknown): Familia | null {
  const p = String(plano ?? '').toLowerCase()
  if (!p) return null
  if (/funded|torneio|challenge/.test(p)) return 'funded'
  if (/copy|mtmcopy|copier/.test(p)) return 'copy'
  if (/auto|t2t|tap/.test(p)) return 'auto_t2t'
  if (/premium|vip|sinal|signal|scanner|alerta/.test(p)) return 'sinais'
  if (/ea|sensei_ea|licen|software|saas/.test(p)) return 'software'
  if (/member|membro|formac|curso|bootcamp|academ|pack|essential|fundador/.test(p)) return 'formacao'
  return null
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Base de dados: juntar a evidência e registar. Tudo o que decide ficou acima.
// ─────────────────────────────────────────────────────────────────────────────────────────────

type Db = { from: (tabela: string) => any }

function normaliza(canal: string, v: string) {
  const s = String(v ?? '').trim()
  return canal === 'email' ? s.toLowerCase() : s
}

/**
 * Junta a evidência. Na dúvida, o lado seguro: uma leitura de EXCLUSÃO que falha conta como
 * EXCLUÍDO (não se contacta quem não se conseguiu verificar).
 */
export async function juntarEvidencia(db: Db, p: PedidoContacto, extra: { iniciou?: boolean; templateAprovado?: boolean } = {}): Promise<Evidencia> {
  const canal = String(p.canal).toLowerCase()
  const destino = normaliza(canal, p.destino)
  const ev: Evidencia = { iniciou: extra.iniciou === true, templateAprovado: extra.templateAprovado === true }

  // Identificadores da mesma pessoa noutros canais (para a exclusão ser GLOBAL).
  const ids: { email?: string; telefone?: string; telegram_chat_id?: string; user_id?: string } = {}
  if (canal === 'email') ids.email = destino
  if (canal === 'sms' || canal === 'whatsapp' || canal === 'chamada') ids.telefone = destino
  if (canal === 'telegram') ids.telegram_chat_id = destino
  if (ids.email || ids.telefone) {
    const q = db.from('profiles').select('id, email, phone')
    const { data } = await (ids.email ? q.ilike('email', ids.email) : q.eq('phone', ids.telefone)).limit(1)
    const pr = (data ?? [])[0]
    if (pr) {
      ids.user_id = pr.id
      ids.email = ids.email ?? (pr.email ? String(pr.email).toLowerCase() : undefined)
      ids.telefone = ids.telefone ?? (pr.phone ? String(pr.phone) : undefined)
    }
  }
  if (canal === 'telegram') {
    const { data } = await db.from('telegram_leads').select('email, telefone, message_count, tags').eq('chat_id', destino).limit(1)
    const l = (data ?? [])[0]
    ev.conversaBotAberta = !!l
    if (l?.email) ids.email = String(l.email).toLowerCase()
    if (l?.telefone) ids.telefone = String(l.telefone)
    if ((l?.tags ?? []).some((t: string) => /^(optout|opt_out|stop|sair|nao_contactar)$/i.test(String(t)))) ev.excluido = true
  }

  // ── Exclusão global ──
  const { data: excl, error: eExcl } = await db.from('contacto_exclusao').select('identificador')
    .in('identificador', [ids.email, ids.telefone, ids.telegram_chat_id, destino].filter(Boolean))
  if (eExcl) ev.excluido = true
  else if ((excl ?? []).length) ev.excluido = true

  const ors = Object.entries({ email: ids.email, telefone: ids.telefone, telegram_chat_id: ids.telegram_chat_id })
    .filter(([, v]) => v).map(([k, v]) => `${k}.eq.${v}`)
  if (ors.length) {
    const { data: cons, error: eCons } = await db.from('captacao_consentimento').select('canal, retirado_em').or(ors.join(','))
    if (eCons) ev.excluido = true
    for (const c of (cons ?? []) as Array<{ canal: string | null; retirado_em: string | null }>) {
      if (c.retirado_em) ev.excluido = true
      else if (String(c.canal ?? '').toLowerCase() === canal || (canal === 'sms' && c.canal === 'telefone')) ev.consentimentoCanal = true
    }
  }
  if (ids.user_id) {
    const { data: pref } = await db.from('email_preferences').select('unsubscribed_all, marketing_emails').eq('user_id', ids.user_id).maybeSingle()
    if (pref?.unsubscribed_all === true) ev.excluido = true
    if (canal === 'email' && pref?.marketing_emails === false) ev.excluido = true
    const { data: pagos } = await db.from('payment_history').select('plan, status').eq('user_id', ids.user_id).limit(50)
    const { data: vendas } = await db.from('vendas_vendas').select('pack, estornada_em').eq('comprador_id', ids.user_id).limit(50)
    const fam = new Set<Familia>()
    const contrato = new Set<Familia>()
    const { data: perfil } = await db.from('profiles').select('subscription_plan').eq('id', ids.user_id).maybeSingle()
    const fPerfil = familiaDoPlano(perfil?.subscription_plan)
    if (fPerfil) contrato.add(fPerfil)
    for (const x of (pagos ?? []) as Array<{ plan: string | null; status: string }>) {
      const f = familiaDoPlano(x.plan)
      if (f) contrato.add(f)
    }
    for (const x of (pagos ?? []) as Array<{ plan: string | null; status: string }>) {
      if (/succeeded|paid|pago|complete/i.test(String(x.status))) {
        // O 1.º débito do Stripe chega muitas vezes SEM plano. Atribui-se só quando o contrato
        // da pessoa tem UMA família — com duas, não se adivinha qual delas pagou.
        const f = familiaDoPlano(x.plan) ?? (contrato.size === 1 ? [...contrato][0] : null)
        if (f) fam.add(f)
      }
    }
    for (const x of (vendas ?? []) as Array<{ pack: string; estornada_em: string | null }>) {
      if (!x.estornada_em) { const f = familiaDoPlano(x.pack); if (f) fam.add(f) }
    }
    ev.familiasCompradas = [...fam]
    ev.familiasContrato = [...new Set([...contrato, ...fam])]
  }
  if (canal === 'email' && ids.email) {
    const { data: s } = await db.from('email_sends').select('unsubscribed_at').eq('email', ids.email).not('unsubscribed_at', 'is', null).limit(1)
    if ((s ?? []).length) ev.excluido = true
  }
  // B2B: domínio de empresa E não ser email de um cliente particular registado (um cliente com
  // email no domínio da empresa dele continua a ser tratado como cliente, não como B2B).
  if (canal === 'email' && !eWebmail(destino)) ev.emailProfissional = !ids.user_id
  return ev
}

/** Envios por iniciativa já feitos hoje (Lisboa ≈ UTC; conta-se desde a meia-noite UTC). */
export async function contarHoje(db: Db, agenteId: string, canal: string): Promise<{ agenteHoje: number; canalHoje: number } | null> {
  const desde = new Date(); desde.setUTCHours(0, 0, 0, 0)
  // Só contam os que SAÍRAM: um pedido recusado não gasta o tecto.
  const { data, error } = await db.from('agentes_envios').select('canal').eq('agente_id', agenteId).eq('decisao', 'sai').gte('criado_em', desde.toISOString())
  if (error) return null
  const linhas = (data ?? []) as Array<{ canal: string }>
  return { agenteHoje: linhas.length, canalHoje: linhas.filter((l) => l.canal === canal).length }
}

/** Grava a decisão — saia ou não — com a base legal. É o registo que a lei pede para provar a base. */
export async function registarEnvio(db: Db, agenteId: string, p: PedidoContacto, d: Decisao, ensaio = false) {
  if (ensaio) return { ok: true }
  const { error } = await db.from('agentes_envios').insert({
    agente_id: agenteId,
    canal: String(p.canal).toLowerCase(),
    destino: normaliza(String(p.canal).toLowerCase(), p.destino),
    base_legal: d.base,
    decisao: d.destino,
    motivo: d.porque,
    familia_oferta: p.familiaOferta ?? null,
    texto: String(p.texto).slice(0, 4000),
  })
  return { ok: !error, erro: error?.message }
}

