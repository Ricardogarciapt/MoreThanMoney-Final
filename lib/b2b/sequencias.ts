/**
 * AS SEQUÊNCIAS B2B — 3 toques por segmento, pt-PT para Portugal e pt-BR para o Brasil. Puro.
 *
 * Regras de escrita (decisões do dono):
 *  · curto e humano: uma ideia por email, uma pergunta no fim;
 *  · NENHUM número de resultado. A prova desta casa mede-se em pips e com origem declarada — num
 *    primeiro contacto não se cita nenhuma; quem quiser vê-la pede-a na conversa;
 *  · todo o email leva: a MTM identificada, a assinatura com identificação, a linha de saída com o
 *    link que grava na exclusão global, e o link com `?ag=` do agente dono do B2B (AG-PROSPECTOR, decisão do dono a 07/10).
 *
 * `validarMensagem` é a porta: uma mensagem sem saída, sem `?ag=` ou sem identificação NÃO sai.
 */
import { createHmac, timingSafeEqual } from 'crypto'
import { AG, linkAssinado, linkTemAg } from '@/lib/agentes/codigos'
import { identificaMtm, temSaida } from '@/lib/agentes/contacto-inicial'

export type Segmento = 'ib_afiliado' | 'comunidade' | 'criador' | 'escola' | 'prop_firm'
export type Pais = 'PT' | 'BR'
export const SEGMENTOS: readonly Segmento[] = ['ib_afiliado', 'comunidade', 'criador', 'escola', 'prop_firm']

/**
 * O agente que assina os links B2B e a quem os envios ficam atribuídos. 07/10 («activa tudo»): o
 * Prospector passa a ser o DONO do envio B2B — recolhe a lista e envia. Até aqui era o AG-CLOSER.
 */
export const AGENTE_B2B = AG.PROSPECTOR

const RAIZ = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.morethanmoney.pt').replace(/\/$/, '')

/** Onde leva o 1.º toque de cada segmento (a oferta). Os toques 2 e 3 levam à agenda. */
export const PAGINA_DA_OFERTA: Record<Segmento, string> = {
  ib_afiliado: '/agendar', // parceria de IB e rotação de links (/abrir-conta) — conversa-se
  comunidade: '/mtmfunded', // MTM Funded para comunidades
  criador: '/criadores', // programa de criadores
  escola: '/mtmauto', // white-label/franchise do MTM Auto (+ licença do EA Sensei)
  prop_firm: '/sensei-ea', // licença do EA Sensei
}

// ── O link de saída: assinado, para ninguém tirar da lista o email de outra pessoa ─────────────

function b64url(s: string) {
  return Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function deB64url(s: string) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}
export function assinaturaSaida(email: string, segredo: string): string {
  return createHmac('sha256', segredo).update('b2b-sair:' + email.toLowerCase()).digest('hex').slice(0, 24)
}
export function linkSaida(email: string, segredo: string, raiz = RAIZ): string {
  const e = email.trim().toLowerCase()
  return `${raiz}/api/b2b/sair?e=${b64url(e)}&t=${assinaturaSaida(e, segredo)}`
}
/** Lê e confirma um link de saída. Devolve o email, ou null se a assinatura não bate. */
export function lerSaida(e: string | null, t: string | null, segredo: string): string | null {
  if (!e || !t || !segredo) return null
  let email = ''
  try { email = deB64url(e).trim().toLowerCase() } catch { return null }
  if (!email.includes('@')) return null
  const certo = Buffer.from(assinaturaSaida(email, segredo))
  const dado = Buffer.from(String(t))
  return certo.length === dado.length && timingSafeEqual(certo, dado) ? email : null
}
export function segredoSaida(): string {
  return String(process.env.B2B_SAIR_SEGREDO || process.env.CRON_SECRET || '').trim()
}

// ── A identificação (assinatura) ──────────────────────────────────────────────────────────────

export interface Identificacao {
  assinante: string
  /** Denominação + morada/sede, como deve aparecer no rodapé. Vem do ambiente — não se inventa. */
  linhaLegal: string
}
export function identificacaoDoAmbiente(): Identificacao {
  return {
    assinante: String(process.env.B2B_ASSINANTE || 'Ricardo Garcia').trim(),
    linhaLegal: String(process.env.B2B_IDENTIFICACAO || 'MoreThanMoney - Ricardo Garcia · NIF 241991439 · Portugal · www.morethanmoney.pt').trim(),
  }
}

// ── Os textos ────────────────────────────────────────────────────────────────────────────────

interface Corpo { assunto: string; corpo: string }
type Escritor = (empresa: string, link: string) => Corpo

const PT: Record<Segmento, [Escritor, Escritor, Escritor]> = {
  ib_afiliado: [
    (e, l) => ({
      assunto: `Parceria de IB com a ${e}?`,
      corpo: `Olá, equipa da ${e},\n\nSou o Ricardo, da More Than Money (MTM) — formamos traders em Portugal e temos sinais, copy trading e uma app de execução.\n\nOs registos de corretora que a nossa comunidade gera passam por um único link que roda entre IBs parceiros: cada dia pertence a um IB e os encaminhamentos ficam contados. Procuramos parceiros para entrar nessa rotação — e, no sentido inverso, podemos pôr as nossas ferramentas ao serviço dos vossos clientes.\n\nFaz sentido falarmos 15 minutos? Marcam aqui: ${l}`,
    }),
    (e, l) => ({
      assunto: `Re: Parceria de IB com a ${e}?`,
      corpo: `Olá novamente,\n\nSó para retomar o email anterior: a rotação é verificável — um dia inteiro por IB, com o painel a mostrar quantas pessoas foram encaminhadas.\n\nSe não for convosco, quem trata de parcerias na ${e}? Se for, a agenda está aqui: ${l}`,
    }),
    (e, l) => ({
      assunto: `Fecho por aqui`,
      corpo: `Olá,\n\nÚltimo email sobre isto. Se uma parceria de IB não for prioridade para a ${e} agora, não volto a insistir.\n\nSe um dia fizer sentido, a agenda fica aqui: ${l}`,
    }),
  ],
  comunidade: [
    (e, l) => ({
      assunto: `MTM Funded para a comunidade da ${e}`,
      corpo: `Olá, equipa da ${e},\n\nSou o Ricardo, da More Than Money (MTM). Temos o MTM Funded: o trader faz uma avaliação e, se passar, negoceia capital patrocinado com uma participação de 75/25.\n\nPara comunidades montamos condições próprias para os vossos membros — e, se fizer sentido, uma área com a vossa marca.\n\nQuerem ver como funcionaria na ${e}? Está tudo aqui: ${l}`,
    }),
    (e, l) => ({
      assunto: `Re: MTM Funded para a comunidade da ${e}`,
      corpo: `Olá novamente,\n\nRetomo o email anterior com uma pergunta simples: os membros da ${e} já procuram contas financiadas, ou ainda não é tema?\n\nSe for, marcamos 15 minutos: ${l}`,
    }),
    (e, l) => ({
      assunto: `Fecho por aqui`,
      corpo: `Olá,\n\nÚltimo email sobre o MTM Funded. Se não for o momento para a ${e}, fica por aqui e não volto a insistir.\n\nSe mudar, a agenda está aqui: ${l}`,
    }),
  ],
  criador: [
    (e, l) => ({
      assunto: `Programa de criadores da MTM`,
      corpo: `Olá, equipa da ${e},\n\nSou o Ricardo, da More Than Money (MTM). Temos um programa para quem cria conteúdo financeiro: acesso Premium + VIP à MTM durante 60 dias para conhecerem tudo por dentro e, se fizer sentido, um código próprio para a vossa audiência e os vossos conteúdos à venda na nossa plataforma.\n\nOs detalhes estão aqui: ${l}\n\nInteressa-vos?`,
    }),
    (e, l) => ({
      assunto: `Re: Programa de criadores da MTM`,
      corpo: `Olá novamente,\n\nSem compromisso: posso enviar-vos o código de acesso de 60 dias para verem a MTM por dentro antes de decidirem qualquer coisa. Basta responderem a este email.\n\nOu marquem 15 minutos: ${l}`,
    }),
    (e, l) => ({
      assunto: `Fecho por aqui`,
      corpo: `Olá,\n\nÚltimo email sobre o programa de criadores. Se não for para a ${e}, não volto a insistir.\n\nSe um dia fizer sentido: ${l}`,
    }),
  ],
  escola: [
    (e, l) => ({
      assunto: `Ferramentas para os alunos da ${e}`,
      corpo: `Olá, equipa da ${e},\n\nSou o Ricardo, da More Than Money (MTM). Para escolas de trading temos duas coisas que complementam a formação: o MTM Auto em white-label — a app de execução com a vossa marca, gerida pela vossa equipa — e o EA MTM Sensei para MetaTrader 5, com licenças para os alunos.\n\nQuerem ver como seria com a marca da ${e}? ${l}`,
    }),
    (e, l) => ({
      assunto: `Re: Ferramentas para os alunos da ${e}`,
      corpo: `Olá novamente,\n\nRetomo o email anterior: o white-label funciona por equipa — vocês gerem os vossos alunos, nós tratamos da tecnologia.\n\nFaz sentido uma demonstração de 15 minutos? ${l}`,
    }),
    (e, l) => ({
      assunto: `Fecho por aqui`,
      corpo: `Olá,\n\nÚltimo email sobre isto. Se não for o momento para a ${e}, não volto a insistir.\n\nSe mudar, a agenda está aqui: ${l}`,
    }),
  ],
  prop_firm: [
    (e, l) => ({
      assunto: `Parceria MTM × ${e}`,
      corpo: `Olá, equipa da ${e},\n\nSou o Ricardo, da More Than Money (MTM). Desenvolvemos o MTM Sensei, um EA para MetaTrader 5 com filtro de notícias e gestão de risco por regras, e temos uma comunidade de traders que procura avaliações.\n\nVejo duas vias: licenças do EA para os vossos traders, e encaminhar a nossa comunidade para as vossas avaliações. O EA está aqui: ${l}\n\nFaz sentido falarmos?`,
    }),
    (e, l) => ({
      assunto: `Re: Parceria MTM × ${e}`,
      corpo: `Olá novamente,\n\nSó para retomar: quem trata de parcerias na ${e}? Se for convosco, marcamos 15 minutos: ${l}`,
    }),
    (e, l) => ({
      assunto: `Fecho por aqui`,
      corpo: `Olá,\n\nÚltimo email sobre esta parceria. Se não for prioridade para a ${e}, não volto a insistir.\n\nSe um dia fizer sentido: ${l}`,
    }),
  ],
}

const BR: Record<Segmento, [Escritor, Escritor, Escritor]> = {
  ib_afiliado: [
    (e, l) => ({
      assunto: `Parceria de IB com a ${e}?`,
      corpo: `Oi, pessoal da ${e},\n\nSou o Ricardo, da More Than Money (MTM), uma empresa portuguesa que forma traders e tem sinais, copy trading e um app de execução.\n\nOs cadastros em corretora que a nossa comunidade gera passam por um único link que faz rodízio entre IBs parceiros: cada dia pertence a um IB e os encaminhamentos ficam contados. Estamos buscando parceiros para entrar nesse rodízio — e, no sentido inverso, podemos levar nossas ferramentas aos clientes de vocês.\n\nFaz sentido a gente conversar 15 minutos? Agendem aqui: ${l}`,
    }),
    (e, l) => ({
      assunto: `Re: Parceria de IB com a ${e}?`,
      corpo: `Oi de novo,\n\nRetomando o e-mail anterior: o rodízio é verificável — um dia inteiro por IB, com o painel mostrando quantas pessoas foram encaminhadas.\n\nSe não for com vocês, quem cuida de parcerias na ${e}? Se for, a agenda está aqui: ${l}`,
    }),
    (e, l) => ({
      assunto: `Encerrando por aqui`,
      corpo: `Oi,\n\nÚltimo e-mail sobre isso. Se uma parceria de IB não for prioridade para a ${e} agora, não volto a insistir.\n\nSe um dia fizer sentido, a agenda fica aqui: ${l}`,
    }),
  ],
  comunidade: [
    (e, l) => ({
      assunto: `MTM Funded para a comunidade da ${e}`,
      corpo: `Oi, pessoal da ${e},\n\nSou o Ricardo, da More Than Money (MTM), de Portugal. Temos o MTM Funded: o trader faz uma avaliação e, se passar, opera capital patrocinado com divisão de 75/25.\n\nPara comunidades a gente monta condições próprias para os membros — e, se fizer sentido, uma área com a marca de vocês.\n\nQuerem ver como funcionaria na ${e}? Está tudo aqui: ${l}`,
    }),
    (e, l) => ({
      assunto: `Re: MTM Funded para a comunidade da ${e}`,
      corpo: `Oi de novo,\n\nRetomo o e-mail anterior com uma pergunta simples: os membros da ${e} já procuram contas financiadas, ou ainda não é assunto?\n\nSe for, agendamos 15 minutos: ${l}`,
    }),
    (e, l) => ({
      assunto: `Encerrando por aqui`,
      corpo: `Oi,\n\nÚltimo e-mail sobre o MTM Funded. Se não for o momento para a ${e}, paro por aqui.\n\nSe mudar, a agenda está aqui: ${l}`,
    }),
  ],
  criador: [
    (e, l) => ({
      assunto: `Programa de criadores da MTM`,
      corpo: `Oi, pessoal da ${e},\n\nSou o Ricardo, da More Than Money (MTM), de Portugal. Temos um programa para quem cria conteúdo financeiro: acesso Premium + VIP à MTM por 60 dias para conhecerem tudo por dentro e, se fizer sentido, um código próprio para a audiência de vocês e os seus conteúdos à venda na nossa plataforma.\n\nOs detalhes estão aqui: ${l}\n\nTêm interesse?`,
    }),
    (e, l) => ({
      assunto: `Re: Programa de criadores da MTM`,
      corpo: `Oi de novo,\n\nSem compromisso: posso mandar o código de acesso de 60 dias para vocês verem a MTM por dentro antes de decidir qualquer coisa. É só responder este e-mail.\n\nOu agendem 15 minutos: ${l}`,
    }),
    (e, l) => ({
      assunto: `Encerrando por aqui`,
      corpo: `Oi,\n\nÚltimo e-mail sobre o programa de criadores. Se não for para a ${e}, não volto a insistir.\n\nSe um dia fizer sentido: ${l}`,
    }),
  ],
  escola: [
    (e, l) => ({
      assunto: `Ferramentas para os alunos da ${e}`,
      corpo: `Oi, pessoal da ${e},\n\nSou o Ricardo, da More Than Money (MTM), de Portugal. Para escolas de trading temos duas coisas que complementam a formação: o MTM Auto em white-label — o app de execução com a marca de vocês, gerido pela equipe de vocês — e o EA MTM Sensei para MetaTrader 5, com licenças para os alunos.\n\nQuerem ver como ficaria com a marca da ${e}? ${l}`,
    }),
    (e, l) => ({
      assunto: `Re: Ferramentas para os alunos da ${e}`,
      corpo: `Oi de novo,\n\nRetomando: o white-label funciona por equipe — vocês cuidam dos alunos, a gente cuida da tecnologia.\n\nFaz sentido uma demonstração de 15 minutos? ${l}`,
    }),
    (e, l) => ({
      assunto: `Encerrando por aqui`,
      corpo: `Oi,\n\nÚltimo e-mail sobre isso. Se não for o momento para a ${e}, não volto a insistir.\n\nSe mudar, a agenda está aqui: ${l}`,
    }),
  ],
  prop_firm: [
    (e, l) => ({
      assunto: `Parceria MTM × ${e}`,
      corpo: `Oi, pessoal da ${e},\n\nSou o Ricardo, da More Than Money (MTM), de Portugal. Desenvolvemos o MTM Sensei, um EA para MetaTrader 5 com filtro de notícias e gestão de risco por regras, e temos uma comunidade de traders que busca mesas de avaliação.\n\nVejo dois caminhos: licenças do EA para os traders de vocês, e encaminhar a nossa comunidade para as avaliações de vocês. O EA está aqui: ${l}\n\nFaz sentido a gente conversar?`,
    }),
    (e, l) => ({
      assunto: `Re: Parceria MTM × ${e}`,
      corpo: `Oi de novo,\n\nSó retomando: quem cuida de parcerias na ${e}? Se for com vocês, agendamos 15 minutos: ${l}`,
    }),
    (e, l) => ({
      assunto: `Encerrando por aqui`,
      corpo: `Oi,\n\nÚltimo e-mail sobre essa parceria. Se não for prioridade para a ${e}, não volto a insistir.\n\nSe um dia fizer sentido: ${l}`,
    }),
  ],
}

export interface PedidoMensagem {
  segmento: Segmento
  pais: Pais
  toque: 1 | 2 | 3
  empresa: string
  email: string
  agente?: string
  segredo: string
  identificacao?: Identificacao
}

export interface Mensagem {
  assunto: string
  texto: string
  linkOferta: string
  linkSair: string
}

export function montarMensagem(p: PedidoMensagem): Mensagem {
  const id = p.identificacao ?? identificacaoDoAmbiente()
  const caminho = p.toque === 1 ? PAGINA_DA_OFERTA[p.segmento] : '/agendar'
  const linkOferta = linkAssinado(caminho, AGENTE_B2B)
  const sair = linkSaida(p.email, p.segredo)
  const { assunto, corpo } = (p.pais === 'BR' ? BR : PT)[p.segmento][p.toque - 1](p.empresa.trim(), linkOferta)
  const linhaSaida =
    p.pais === 'BR'
      ? `Você recebeu este e-mail por ser o contato profissional publicado pela ${p.empresa.trim()}. Para não receber mais nada da MTM, saia aqui (um clique): ${sair}`
      : `Recebem este email por ser o contacto profissional publicado pela ${p.empresa.trim()}. Para deixar de receber qualquer email da MTM, saiam aqui (um clique): ${sair}`
  const texto = `${corpo}\n\n—\n${id.assinante}\n${id.linhaLegal}\n\n${linhaSaida}`
  return { assunto, texto, linkOferta, linkSair: sair }
}

/**
 * A PORTA. Uma mensagem só sai com: link de saída para a exclusão global, link com `?ag=` válido,
 * a MTM identificada e a assinatura. Falta uma → recusada.
 */
export function validarMensagem(texto: string): { ok: boolean; motivo: string } {
  const t = String(texto ?? '')
  if (!t.trim()) return { ok: false, motivo: 'Mensagem vazia.' }
  const links = t.match(/https?:\/\/[^\s<>()]+/g) ?? []
  const temLinkSaida = links.some((u) => /\/api\/b2b\/sair\?e=[^&\s]+&t=[0-9a-f]{24}\b/.test(u))
  if (!temLinkSaida || !temSaida(t)) return { ok: false, motivo: 'Sem linha de saída com o link de remoção — não sai.' }
  if (!links.some((u) => linkTemAg(u))) return { ok: false, motivo: 'Sem link com ?ag= do agente — não sai.' }
  if (!identificaMtm(t) || !/morethanmoney\.pt/i.test(t)) return { ok: false, motivo: 'Sem a MTM identificada na assinatura — não sai.' }
  return { ok: true, motivo: 'Saída, ?ag= e identificação presentes.' }
}
