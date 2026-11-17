/**
 * APOIO AO CLIENTE — a parte com base de dados, IA e avisos.
 *
 * As decisões estão em `regras.ts` (puras e provadas). Aqui só se lê, se grava, se chama a IA
 * pela porta única (`lib/ia/chamar.ts`, grátis primeiro) e se avisa o dono no Telegram.
 */
import { createHash, randomBytes } from 'node:crypto'
import { chamarIA, type MensagemIA } from '@/lib/ia/chamar'
import { blocoFramework, LINK_MTM_FUNDED } from '@/lib/framework-mtm'
import { PRECO_MEMBRO, PRECO_PREMIUM, PRECO_PREMIUM_1O_MES, PRECO_TOPO, NOME_DEGRAU_TOPO } from '@/lib/escada-precos'
import {
  deveEscalar, NOME_ASSUNTO, pedePessoa, proximoPrazo, respostaSegura, textoEscalada, textoEsperaEquipa,
  textoIaIndisponivel, triar, type Assunto, type Estado,
} from './regras'
import { idiomaApoio, textosApoio } from './idiomas'
import { LANGUAGE_NAMES_EN } from '@/lib/chat-traducao-idiomas'
import { languageOption } from '@/lib/i18n/languages'

type Db = { from: (t: string) => any }

const SITE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.morethanmoney.pt'

export type Conversa = {
  id: string
  user_id: string | null
  nome: string | null
  email: string | null
  assunto: Assunto
  estado: Estado
  escalada: boolean
  em_espera_desde: string | null
  prazo_em: string | null
  nivel_aviso: number
  primeira_resposta_em: string | null
  ultima_mensagem_em: string
  /** Idioma da conversa (um dos 21 do site). Decide as frases fixas e a tradução da equipa. */
  idioma?: string | null
}

/**
 * As frases fixas no idioma da conversa. Em português ficam as de `regras.ts` (que distinguem
 * reembolso de reclamação); nos outros 20 idiomas vêm de `idiomas.ts`.
 */
function frases(idioma: string | null | undefined) {
  const l = idiomaApoio(idioma)
  const t = textosApoio(l)
  const pt = l === 'pt'
  return {
    escalada: (a: Assunto) => (pt ? textoEscalada(a) : t.escalada),
    jaRegistado: (comEmail: boolean) => (pt && comEmail ? 'Obrigado, ficou registado. O Ricardo responde-te por aqui ou por email.' : t.jaRegistado),
    recebido: (comEmail: boolean) => (pt && comEmail ? 'Obrigado, guardei o teu email. A equipa responde-te em breve.' : t.recebido),
    esperaEquipa: () => (pt ? textoEsperaEquipa() : t.esperaEquipa),
    iaIndisponivel: () => (pt ? textoIaIndisponivel() : t.iaIndisponivel),
    seguro: (texto: string) => {
      const s = respostaSegura(texto)
      return s === texto || pt ? s : t.guardaReembolso
    },
    naoPercebi: t.naoPercebi,
  }
}

/** «🇩🇪 Deutsch» para os avisos ao dono; vazio em português (é o normal). */
function etiquetaIdioma(idioma: string | null | undefined): string {
  const l = idiomaApoio(idioma)
  if (l === 'pt') return ''
  const o = languageOption(l)
  return o ? ` · ${o.flag} ${o.nativeName}` : ` · ${l}`
}

export type Mensagem = { id: number; autor: 'cliente' | 'agente' | 'equipa' | 'sistema'; texto: string; criado_em: string }

export function hashChave(chave: string): string {
  return createHash('sha256').update(`suporte:${chave}`).digest('hex')
}

export function novaChave(): string {
  return randomBytes(24).toString('base64url')
}

/** A chave do browser tem de ter cara de chave: impede que «abc» adivinhe a conversa de alguém. */
export function chaveValida(c: unknown): c is string {
  return typeof c === 'string' && /^[A-Za-z0-9_-]{24,64}$/.test(c)
}

export async function conversaPorChave(db: Db, chave: string): Promise<Conversa | null> {
  const { data } = await db.from('suporte_conversas').select('*').eq('chave_hash', hashChave(chave)).maybeSingle()
  return (data as Conversa) ?? null
}

export async function mensagensDe(db: Db, conversaId: string, depoisDe = 0): Promise<Mensagem[]> {
  const { data } = await db
    .from('suporte_mensagens')
    .select('id, autor, texto, criado_em')
    .eq('conversa_id', conversaId)
    .gt('id', depoisDe)
    .order('id', { ascending: true })
    .limit(200)
  return (data as Mensagem[]) ?? []
}

async function gravar(db: Db, conversaId: string, autor: Mensagem['autor'], texto: string, extra: Record<string, unknown> = {}) {
  await db.from('suporte_mensagens').insert({ conversa_id: conversaId, autor, texto, ...extra })
}

/** Avisa o dono no chat de admin do Telegram. Melhor esforço: nunca parte a conversa. */
export async function avisarDono(texto: string): Promise<boolean> {
  try {
    const { getMtmcopyBotToken } = await import('@/lib/mtmcopy/telegram-bot')
    const { chatDeAdminDoAmbiente } = await import('@/lib/telegram-admin-menu')
    const token = getMtmcopyBotToken()
    if (!token) return false
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatDeAdminDoAmbiente(), text: texto, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5000),
    })
    return r.ok
  } catch {
    return false
  }
}

function linkCrm(id: string) {
  return `${SITE}/admin/suporte?c=${id}`
}

/** O que o agente sabe. Curto de propósito: é a primeira linha, não o manual inteiro. */
export function contextoAgente(quem: 'membro' | 'visitante', assunto: Assunto, idioma: string = 'pt'): string {
  const l = idiomaApoio(idioma)
  const nome = LANGUAGE_NAMES_EN[l] || 'European Portuguese (Portugal)'
  const blocoIdioma =
    l === 'pt'
      ? 'IDIOMA: o site está em português. Responde em português de Portugal; se o cliente escrever noutro idioma, responde no idioma dele.'
      : `IDIOMA (obrigatório): o site está em ${nome}. Responde SEMPRE no idioma em que o cliente escreve; se a mensagem não deixar claro, responde em ${nome}. Nunca respondas em português a quem não escreve em português. Tom próximo e informal, como é natural nesse idioma. Não traduzas nomes de produtos, scanners nem educadores (MTM, MoreThanMoney, Premium, MTM Auto, MTM Funded, WebTrader, GoldKiller, Sensei, DEFY, Tap to Trade, PU Prime). As regras abaixo valem em qualquer idioma: nunca prometes reembolso, em nenhuma língua.`
  return `${blocoIdioma}

És o Apoio ao Cliente da MoreThanMoney (MTM), no chat do site. Respondes sozinho a membros, visitantes, leads e prospects.

QUEM ESTÁ A FALAR: ${quem === 'membro' ? 'um membro com sessão iniciada' : 'um visitante sem sessão (pode ser lead ou cliente sem login)'}.
ASSUNTO DA TRIAGEM: ${NOME_ASSUNTO[assunto]}.

O QUE SABES
· Planos: Membro ${PRECO_MEMBRO}; Premium ${PRECO_PREMIUM} (1.º mês ${PRECO_PREMIUM_1O_MES}, trial de 3 dias); ${NOME_DEGRAU_TOPO} ${PRECO_TOPO}. Ver e mudar plano: ${SITE}/upgrade.
· Rota Corretora: quem abre e financia conta na PU Prime pelo link MTM tem o Premium desbloqueado enquanto a conta estiver financiada.
· Sem capital para começar: MTM Funded (${LINK_MTM_FUNDED}), contas SIMULADAS com Patrocínio de Desempenho. Não é prop firm.
· Acessos: entrar em ${SITE}/login; recuperar palavra-passe em ${SITE}/forgot-password. A app web está em ${SITE}/app-mobile.
· Falar com alguém ao vivo / onboarding: ${SITE}/agendar.

COMO RESPONDES
· No idioma do cliente (ver IDIOMA). Em português: de Portugal, por tu. Curto (2 a 5 frases), claro, com o próximo passo concreto e o link certo.
· Se não sabes, dizes que não sabes e que passas à equipa. Não inventas funcionalidades, preços nem prazos.
· Nunca pedes palavras-passe, códigos, dados de cartão nem credenciais de corretora.
· Nunca dás conselho de investimento, sinais, nem prometes resultados ou retornos.
· Reembolsos e reclamações: NUNCA prometes reembolso nem devolução de dinheiro, nem dizes que alguém tem direito a ele. Esses casos são sempre do Ricardo; dizes que ficou registado e que ele responde.

${blocoFramework('apoio')}`
}

export type ResultadoMensagem = {
  conversaId: string
  assunto: Assunto
  estado: Estado
  respostas: Mensagem[]
}

/**
 * O caminho de uma mensagem do cliente: grava, tria, decide (escalar / pessoa / agente), responde.
 * Escalada e espera NÃO chamam a IA: a resposta é fixa e sai já.
 */
export async function receberMensagem(
  db: Db,
  p: { chave: string; texto: string; userId: string | null; nome?: string | null; email?: string | null; pagina?: string | null; site?: string | null; historico?: MensagemIA[]; assuntoSugerido?: Assunto | null; idioma?: string | null },
): Promise<ResultadoMensagem> {
  const agora = new Date().toISOString()
  // A triagem por palavras manda; o botão escolhido no balão só conta quando as palavras não dizem nada.
  const triado = triar(p.texto)
  const assuntoMsg: Assunto = triado === 'outro' && p.assuntoSugerido ? p.assuntoSugerido : triado
  let conversa = await conversaPorChave(db, p.chave)

  if (!conversa) {
    const { data, error } = await db
      .from('suporte_conversas')
      .insert({
        chave_hash: hashChave(p.chave),
        user_id: p.userId,
        nome: p.nome ?? null,
        email: p.email ?? null,
        assunto: assuntoMsg,
        pagina_origem: p.pagina ?? null,
        site: p.site ?? null,
        idioma: idiomaApoio(p.idioma),
      })
      .select('*')
      .single()
    if (error || !data) throw new Error(`suporte: não consegui abrir a conversa (${error?.message ?? 'sem dados'})`)
    conversa = data as Conversa
  }

  const ultimoId = await ultimoIdMensagem(db, conversa.id)
  await gravar(db, conversa.id, 'cliente', p.texto)

  // O assunto só «sobe»: uma conversa que já é reembolso não volta a ser «outro» por um «obrigado».
  const assunto: Assunto = deveEscalar(conversa.assunto) ? conversa.assunto : assuntoMsg !== 'outro' ? assuntoMsg : conversa.assunto
  const patch: Record<string, unknown> = { ultima_mensagem_em: agora, atualizado_em: agora, assunto }
  if (p.userId && !conversa.user_id) patch.user_id = p.userId
  if (p.nome && !conversa.nome) patch.nome = p.nome
  if (p.email) patch.email = p.email
  if (!conversa.primeira_resposta_em) patch.primeira_resposta_em = agora
  // O idioma segue o do site de quem escreve (se mudar de idioma a meio, as frases mudam com ele).
  const idioma = p.idioma ? idiomaApoio(p.idioma) : idiomaApoio(conversa.idioma)
  if (idioma !== conversa.idioma) patch.idioma = idioma
  const f = frases(idioma)

  let estado: Estado = conversa.estado === 'resolvida' ? 'com_agente' : conversa.estado
  let resposta: string
  let fornecedor: string | null = null

  const jaEmEspera = estado === 'escalada' || estado === 'a_aguardar_equipa'

  if (deveEscalar(assunto)) {
    if (estado !== 'escalada') {
      estado = 'escalada'
      Object.assign(patch, { escalada: true, escalada_motivo: assunto, em_espera_desde: agora, nivel_aviso: 0, prazo_em: proximoPrazo(agora, 0) })
      resposta = f.escalada(assunto)
      await avisarDono(
        `🚨 Apoio do site · ${NOME_ASSUNTO[assunto]}${etiquetaIdioma(idioma)}\n` +
          `${p.nome || conversa.nome || 'Sem nome'}${p.email || conversa.email ? ` · ${p.email || conversa.email}` : ''}\n\n` +
          `«${p.texto.slice(0, 600)}»\n\nResponder: ${linkCrm(conversa.id)}`,
      )
    } else {
      resposta = f.jaRegistado(Boolean(p.email))
    }
  } else if (jaEmEspera) {
    // Já está com pessoas: o agente não se mete por cima da equipa, só confirma que recebeu.
    resposta = f.recebido(Boolean(p.email))
  } else if (pedePessoa(p.texto)) {
    estado = 'a_aguardar_equipa'
    Object.assign(patch, { em_espera_desde: agora, nivel_aviso: 0, prazo_em: proximoPrazo(agora, 0) })
    resposta = f.esperaEquipa()
  } else {
    try {
      const historico = (p.historico ?? []).slice(-8)
      const r = await chamarIA({
        tarefa: 'suporte-site',
        sistema: contextoAgente(p.userId ? 'membro' : 'visitante', assunto, idioma),
        mensagens: [...historico, { role: 'user', content: p.texto }],
        maxTokens: 500,
        preferencia: 'rapido',
        temperatura: 0.3,
        timeoutMs: 12_000,
      })
      resposta = f.seguro(r.texto.trim() || f.naoPercebi)
      fornecedor = r.fornecedor
      // Se a guarda trocou o texto, é porque o modelo foi para reembolso: escala.
      if (r.texto.trim() && resposta !== r.texto.trim()) {
        estado = 'escalada'
        Object.assign(patch, { escalada: true, escalada_motivo: 'reembolso', assunto: 'reembolso', em_espera_desde: agora, nivel_aviso: 0, prazo_em: proximoPrazo(agora, 0) })
        await avisarDono(`🚨 Apoio do site · Reembolso (detetado na resposta)${etiquetaIdioma(idioma)}\n«${p.texto.slice(0, 600)}»\n\nResponder: ${linkCrm(conversa.id)}`)
      } else {
        estado = 'com_agente'
      }
    } catch {
      estado = 'a_aguardar_equipa'
      Object.assign(patch, { em_espera_desde: agora, nivel_aviso: 0, prazo_em: proximoPrazo(agora, 0) })
      resposta = f.iaIndisponivel()
    }
  }

  patch.estado = estado
  await db.from('suporte_conversas').update(patch).eq('id', conversa.id)
  await gravar(db, conversa.id, 'agente', resposta, fornecedor ? { fornecedor_ia: fornecedor } : {})

  const novas = await mensagensDe(db, conversa.id, ultimoId)
  return { conversaId: conversa.id, assunto: (patch.assunto as Assunto) ?? assunto, estado, respostas: novas.filter((m) => m.autor !== 'cliente') }
}

async function ultimoIdMensagem(db: Db, conversaId: string): Promise<number> {
  const { data } = await db.from('suporte_mensagens').select('id').eq('conversa_id', conversaId).order('id', { ascending: false }).limit(1).maybeSingle()
  return (data as { id: number } | null)?.id ?? 0
}

/** A resposta de uma pessoa da equipa: pára os prazos e devolve a conversa ao agente (ou fecha). */
export async function responderEquipa(
  db: Db,
  p: { conversaId: string; texto: string; userId: string; fechar?: boolean },
): Promise<{ idioma: string; traduzida: boolean }> {
  const agora = new Date().toISOString()
  // A equipa escreve em português; o cliente lê no idioma da conversa. O original fica guardado.
  const { data: c } = await db.from('suporte_conversas').select('idioma').eq('id', p.conversaId).maybeSingle()
  const idioma = idiomaApoio((c as { idioma?: string } | null)?.idioma)
  let texto = p.texto
  let traduzida = false
  if (idioma !== 'pt') {
    try {
      const { traduzirLote } = await import('@/lib/chat-traducao')
      const [t] = await traduzirLote([p.texto], idioma)
      if (t?.traducao?.trim() && !t.mesmoIdioma) {
        texto = t.traducao.trim()
        traduzida = true
      }
    } catch {
      /* sem tradução: segue o original, e o CRM avisa */
    }
  }
  await gravar(db, p.conversaId, 'equipa', texto, { autor_user_id: p.userId, ...(traduzida ? { texto_original: p.texto } : {}) })
  await db
    .from('suporte_conversas')
    .update({
      ultima_resposta_equipa_em: agora,
      respondida_por: p.userId,
      atualizado_em: agora,
      prazo_em: null,
      em_espera_desde: null,
      nivel_aviso: 0,
      ...(p.fechar ? { estado: 'resolvida' } : {}),
    })
    .eq('id', p.conversaId)
  return { idioma, traduzida }
}

/**
 * Para o CRM: as mensagens do cliente (e do agente) em português, para quem responde perceber.
 * Traduz só o que ainda não tem tradução e guarda-a em `texto_pt`, para não pagar duas vezes.
 */
export async function mensagensParaEquipa(db: Db, conversaId: string, idioma: string | null | undefined) {
  const { data } = await db
    .from('suporte_mensagens')
    .select('id, autor, texto, texto_original, texto_pt, criado_em')
    .eq('conversa_id', conversaId)
    .order('id', { ascending: true })
    .limit(200)
  const msgs = (data ?? []) as Array<Mensagem & { texto_original: string | null; texto_pt: string | null }>
  if (idiomaApoio(idioma) === 'pt') return msgs
  const faltam = msgs.filter((m) => (m.autor === 'cliente' || m.autor === 'agente') && !m.texto_pt).slice(-25)
  if (faltam.length) {
    try {
      const { traduzirLote } = await import('@/lib/chat-traducao')
      const r = await traduzirLote(
        faltam.map((m) => m.texto.slice(0, 2000)),
        'pt',
      )
      await Promise.all(
        faltam.map(async (m, i) => {
          const t = r[i]
          if (!t?.traducao?.trim()) return
          m.texto_pt = t.mesmoIdioma ? m.texto : t.traducao.trim()
          await db.from('suporte_mensagens').update({ texto_pt: m.texto_pt }).eq('id', m.id)
        }),
      )
    } catch {
      /* o CRM mostra o original */
    }
  }
  return msgs
}

/**
 * Os prazos: 15 min e depois 1 h. Chamado pelo cron. Avisa o dono no Telegram por cada conversa
 * que passou o prazo e sobe o nível, para não avisar duas vezes o mesmo.
 */
export async function vigiarPrazos(db: Db, agoraMs = Date.now()): Promise<{ avisadas: number }> {
  const agora = new Date(agoraMs).toISOString()
  const { data } = await db
    .from('suporte_conversas')
    .select('id, nome, email, assunto, estado, em_espera_desde, nivel_aviso, prazo_em, idioma')
    .in('estado', ['a_aguardar_equipa', 'escalada'])
    .not('prazo_em', 'is', null)
    .lte('prazo_em', agora)
    .limit(50)
  const linhas = (data ?? []) as Array<Conversa>
  let avisadas = 0
  for (const c of linhas) {
    const nivel = c.nivel_aviso + 1
    const desde = c.em_espera_desde ?? agora
    const minutos = Math.round((agoraMs - new Date(desde).getTime()) / 60_000)
    await avisarDono(
      `⏰ Apoio do site · ${minutos} min sem resposta da equipa\n` +
        `${NOME_ASSUNTO[c.assunto]}${etiquetaIdioma(c.idioma)} · ${c.estado === 'escalada' ? 'escalada ao Ricardo' : 'à espera da equipa'}\n` +
        `${c.nome || 'Sem nome'}${c.email ? ` · ${c.email}` : ''}\n\nResponder: ${linkCrm(c.id)}`,
    )
    await db.from('suporte_conversas').update({ nivel_aviso: nivel, prazo_em: proximoPrazo(desde, nivel) }).eq('id', c.id)
    avisadas++
  }
  return { avisadas }
}
