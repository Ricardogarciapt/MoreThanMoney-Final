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
export function contextoAgente(quem: 'membro' | 'visitante', assunto: Assunto): string {
  return `És o Apoio ao Cliente da MoreThanMoney (MTM), no chat do site. Respondes sozinho a membros, visitantes, leads e prospects.

QUEM ESTÁ A FALAR: ${quem === 'membro' ? 'um membro com sessão iniciada' : 'um visitante sem sessão (pode ser lead ou cliente sem login)'}.
ASSUNTO DA TRIAGEM: ${NOME_ASSUNTO[assunto]}.

O QUE SABES
· Planos: Membro ${PRECO_MEMBRO}; Premium ${PRECO_PREMIUM} (1.º mês ${PRECO_PREMIUM_1O_MES}, trial de 3 dias); ${NOME_DEGRAU_TOPO} ${PRECO_TOPO}. Ver e mudar plano: ${SITE}/upgrade.
· Rota Corretora: quem abre e financia conta na PU Prime pelo link MTM tem o Premium desbloqueado enquanto a conta estiver financiada.
· Sem capital para começar: MTM Funded (${LINK_MTM_FUNDED}), contas SIMULADAS com Patrocínio de Desempenho. Não é prop firm.
· Acessos: entrar em ${SITE}/login; recuperar palavra-passe em ${SITE}/forgot-password. A app web está em ${SITE}/app-mobile.
· Falar com alguém ao vivo / onboarding: ${SITE}/agendar.

COMO RESPONDES
· Português de Portugal, por tu, curto (2 a 5 frases), claro, com o próximo passo concreto e o link certo.
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
  p: { chave: string; texto: string; userId: string | null; nome?: string | null; email?: string | null; pagina?: string | null; site?: string | null; historico?: MensagemIA[]; assuntoSugerido?: Assunto | null },
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

  let estado: Estado = conversa.estado === 'resolvida' ? 'com_agente' : conversa.estado
  let resposta: string
  let fornecedor: string | null = null

  const jaEmEspera = estado === 'escalada' || estado === 'a_aguardar_equipa'

  if (deveEscalar(assunto)) {
    if (estado !== 'escalada') {
      estado = 'escalada'
      Object.assign(patch, { escalada: true, escalada_motivo: assunto, em_espera_desde: agora, nivel_aviso: 0, prazo_em: proximoPrazo(agora, 0) })
      resposta = textoEscalada(assunto)
      await avisarDono(
        `🚨 Apoio do site · ${NOME_ASSUNTO[assunto]}\n` +
          `${p.nome || conversa.nome || 'Sem nome'}${p.email || conversa.email ? ` · ${p.email || conversa.email}` : ''}\n\n` +
          `«${p.texto.slice(0, 600)}»\n\nResponder: ${linkCrm(conversa.id)}`,
      )
    } else {
      resposta = p.email ? 'Obrigado, ficou registado. O Ricardo responde-te por aqui ou por email.' : 'Ficou registado e junto ao teu pedido. O Ricardo responde-te por aqui.'
    }
  } else if (jaEmEspera) {
    // Já está com pessoas: o agente não se mete por cima da equipa, só confirma que recebeu.
    resposta = p.email ? 'Obrigado, guardei o teu email. A equipa responde-te em breve.' : 'Recebido, juntei à conversa. A equipa responde-te aqui em breve.'
  } else if (pedePessoa(p.texto)) {
    estado = 'a_aguardar_equipa'
    Object.assign(patch, { em_espera_desde: agora, nivel_aviso: 0, prazo_em: proximoPrazo(agora, 0) })
    resposta = textoEsperaEquipa()
  } else {
    try {
      const historico = (p.historico ?? []).slice(-8)
      const r = await chamarIA({
        tarefa: 'suporte-site',
        sistema: contextoAgente(p.userId ? 'membro' : 'visitante', assunto),
        mensagens: [...historico, { role: 'user', content: p.texto }],
        maxTokens: 500,
        preferencia: 'rapido',
        temperatura: 0.3,
        timeoutMs: 12_000,
      })
      resposta = respostaSegura(r.texto.trim() || 'Não consegui perceber. Podes dizer-me de outra forma?')
      fornecedor = r.fornecedor
      // Se a guarda trocou o texto, é porque o modelo foi para reembolso: escala.
      if (resposta !== r.texto.trim()) {
        estado = 'escalada'
        Object.assign(patch, { escalada: true, escalada_motivo: 'reembolso', assunto: 'reembolso', em_espera_desde: agora, nivel_aviso: 0, prazo_em: proximoPrazo(agora, 0) })
        await avisarDono(`🚨 Apoio do site · Reembolso (detetado na resposta)\n«${p.texto.slice(0, 600)}»\n\nResponder: ${linkCrm(conversa.id)}`)
      } else {
        estado = 'com_agente'
      }
    } catch {
      estado = 'a_aguardar_equipa'
      Object.assign(patch, { em_espera_desde: agora, nivel_aviso: 0, prazo_em: proximoPrazo(agora, 0) })
      resposta = textoIaIndisponivel()
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
export async function responderEquipa(db: Db, p: { conversaId: string; texto: string; userId: string; fechar?: boolean }) {
  const agora = new Date().toISOString()
  await gravar(db, p.conversaId, 'equipa', p.texto, { autor_user_id: p.userId })
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
}

/**
 * Os prazos: 15 min e depois 1 h. Chamado pelo cron. Avisa o dono no Telegram por cada conversa
 * que passou o prazo e sobe o nível, para não avisar duas vezes o mesmo.
 */
export async function vigiarPrazos(db: Db, agoraMs = Date.now()): Promise<{ avisadas: number }> {
  const agora = new Date(agoraMs).toISOString()
  const { data } = await db
    .from('suporte_conversas')
    .select('id, nome, email, assunto, estado, em_espera_desde, nivel_aviso, prazo_em')
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
        `${NOME_ASSUNTO[c.assunto]} · ${c.estado === 'escalada' ? 'escalada ao Ricardo' : 'à espera da equipa'}\n` +
        `${c.nome || 'Sem nome'}${c.email ? ` · ${c.email}` : ''}\n\nResponder: ${linkCrm(c.id)}`,
    )
    await db.from('suporte_conversas').update({ nivel_aviso: nivel, prazo_em: proximoPrazo(desde, nivel) }).eq('id', c.id)
    avisadas++
  }
  return { avisadas }
}
