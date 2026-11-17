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
import { demoDoDia } from '@/lib/site-solucoes/demos-diarias'

export type Segmento =
  | 'ib_afiliado' | 'comunidade' | 'criador' | 'escola' | 'prop_firm'
  // 16/11 (ronda B2B do dono): o produto de entrada, as licenças de scanners e as parcerias das redes.
  | 'negocio_local' | 'licenca_scanners' | 'parceria_redes'
/** A LÍNGUA do email: PT = pt-PT (Portugal e PALOP) · BR = pt-BR · INT = inglês · FR · DE · IT. */
export type Pais = 'PT' | 'BR' | 'INT' | 'FR' | 'DE' | 'IT'
export const SEGMENTOS: readonly Segmento[] = ['ib_afiliado', 'comunidade', 'criador', 'escola', 'prop_firm', 'negocio_local', 'licenca_scanners', 'parceria_redes']
export const PAISES: readonly Pais[] = ['PT', 'BR', 'INT', 'FR', 'DE', 'IT']
/** Os segmentos que têm textos em inglês. Os outros não saem para INT (ficam bloqueados com motivo). */
export const SEGMENTOS_INT: readonly Segmento[] = ['negocio_local', 'licenca_scanners', 'parceria_redes']
export function lerPais(v: unknown): Pais {
  const p = String(v ?? 'PT').toUpperCase()
  if (p === 'BR' || p === 'FR' || p === 'DE' || p === 'IT') return p
  return p === 'INT' || p === 'EN' ? 'INT' : 'PT'
}

/**
 * Países onde o email comercial não pedido exige consentimento prévio MESMO a empresas (opt-in B2B):
 * Alemanha e Áustria (UWG §7, TKG §174), Itália (Codice privacy art. 130), Espanha (LSSI art. 21),
 * Países Baixos (Telecommunicatiewet 11.7). Lido pelo domínio do email e pela língua. Orientação geral,
 * não substitui advogado. O envio fica parado com motivo até haver consentimento ou decisão do dono.
 */
export const TLD_OPT_IN = ['de', 'at', 'it', 'es', 'nl'] as const
export function exigeConsentimento(email: string, pais: Pais): boolean {
  if (pais === 'DE' || pais === 'IT') return true
  const tld = String(email ?? '').trim().toLowerCase().split('.').pop() ?? ''
  return (TLD_OPT_IN as readonly string[]).includes(tld)
}

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
  // Os três de 16/11 levam à agenda, ao assunto certo (o dono atende B2B às manhãs de terça e quinta).
  negocio_local: '/agendar?t=negocios', // landing com domínio próprio + app para os clientes
  licenca_scanners: '/agendar?t=negocios', // pacote de 4 scanners em licença semestral
  parceria_redes: '/agendar?t=parcerias', // parcerias para as redes do @ricardogarciapt
}

/** Para onde levam os toques 2 e 3: a agenda, no assunto do segmento. */
export function paginaDoSeguimento(s: Segmento): string {
  return s === 'parceria_redes' ? '/agendar?t=parcerias' : s === 'negocio_local' || s === 'licenca_scanners' ? '/agendar?t=negocios' : '/agendar'
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
type Tres = [Escritor, Escritor, Escritor]

/*
 * Os três segmentos de 16/11. Regras do dono que valem aqui:
 *  · produto de entrada: landing com domínio próprio + app para os clientes do negócio (horários,
 *    marcações), a sair do Beacons/Linktree. O preço fica para a conversa (num 1.º contacto não há €);
 *  · licenças de scanners: para empresas de EDUCAÇÃO EM TRADING (nunca «network marketing» em público,
 *    nunca nomes de empresas nem de pessoas); o valor é por pacote e semestre, discute-se na reunião;
 *  · parcerias das redes: colaborações com o @ricardogarciapt, sem comissões prometidas.
 *  · nada de promessas de lucro nem números de resultado.
 */
const NOVOS_PT: Record<'negocio_local' | 'licenca_scanners' | 'parceria_redes', Tres> = {
  negocio_local: [
    (e, l) => ({
      assunto: `Uma página e uma app com a marca da ${e}`,
      corpo: `Olá, equipa da ${e},\n\nSou o Ricardo, da More Than Money (MTM). Reparei que hoje quem vos procura chega a uma página de links genérica, e não a um sítio com a vossa marca.\n\nFazemos as duas coisas de uma vez: uma página no vosso próprio domínio, pensada para transformar visitas em pedidos, e uma pequena app para os vossos clientes marcarem e acompanharem o que fazem convosco. Preço fechado de criação e uma renovação anual pequena, sem mensalidades.\n\nQuerem ver um exemplo em 15 minutos? Marcam aqui: ${l}`,
    }),
    (e, l) => ({
      assunto: `Re: Uma página e uma app com a marca da ${e}`,
      corpo: `Olá novamente,\n\nSó uma pergunta: hoje, quem chega à ${e} pelas redes consegue marcar ou pedir orçamento sem vos mandar mensagem? Se não consegue, é isso que a página e a app resolvem.\n\nSe fizer sentido, a agenda está aqui: ${l}`,
    }),
    (e, l) => ({
      assunto: `Fecho por aqui`,
      corpo: `Olá,\n\nÚltimo email sobre isto. Se não for o momento para a ${e}, não volto a insistir.\n\nSe um dia quiserem a vossa página e a vossa app, a agenda fica aqui: ${l}`,
    }),
  ],
  licenca_scanners: [
    (e, l) => ({
      assunto: `Scanners de trading com licença para a ${e}`,
      corpo: `Olá, equipa da ${e},\n\nSou o Ricardo, da More Than Money (MTM). Desenvolvemos scanners de trading para TradingView e licenciamo-los a empresas de educação em trading, em pacote e por semestre, para usarem com os vossos alunos.\n\nSe quiserem ir mais longe, desenhamos e programamos a estratégia da vossa casa, que fica vossa, e um mentor de IA treinado nela para a vossa comunidade. É isso que um curso no YouTube não consegue copiar.\n\nFaz sentido uma demonstração de 20 minutos? ${l}`,
    }),
    (e, l) => ({
      assunto: `Re: Scanners de trading com licença para a ${e}`,
      corpo: `Olá novamente,\n\nRetomo o email anterior: a licença é por equipa, com acesso gerido por nós e os alertas a chegar onde os vossos alunos já estão.\n\nQuem trata de parcerias e produto na ${e}? Se for convosco, a agenda está aqui: ${l}`,
    }),
    (e, l) => ({
      assunto: `Fecho por aqui`,
      corpo: `Olá,\n\nÚltimo email sobre as licenças. Se não for prioridade para a ${e}, não volto a insistir.\n\nSe mudar, a agenda fica aqui: ${l}`,
    }),
  ],
  parceria_redes: [
    (e, l) => ({
      assunto: `Colaboração com o @ricardogarciapt?`,
      corpo: `Olá, equipa da ${e},\n\nSou o Ricardo Garcia, da More Than Money (MTM). No Instagram (@ricardogarciapt) falo de educação financeira, trading consciente e de como pôr a IA a trabalhar num negócio pequeno.\n\nGostava de propor uma colaboração com a ${e}: um conteúdo a meias, uma entrevista ou uma série curta, com valor para as duas audiências. Sem compromisso de parte a parte antes de vermos se encaixa.\n\nFaz sentido falarmos? ${l}`,
    }),
    (e, l) => ({
      assunto: `Re: Colaboração com o @ricardogarciapt?`,
      corpo: `Olá novamente,\n\nSó para retomar: quem trata de colaborações e conteúdo na ${e}? Se for convosco, marcamos 15 minutos: ${l}`,
    }),
    (e, l) => ({
      assunto: `Fecho por aqui`,
      corpo: `Olá,\n\nÚltimo email sobre esta colaboração. Se não for o momento para a ${e}, não volto a insistir.\n\nSe um dia fizer sentido: ${l}`,
    }),
  ],
}

const NOVOS_BR: Record<'negocio_local' | 'licenca_scanners' | 'parceria_redes', Tres> = {
  negocio_local: [
    (e, l) => ({
      assunto: `Uma página e um app com a marca da ${e}`,
      corpo: `Oi, pessoal da ${e},\n\nSou o Ricardo, da More Than Money (MTM), de Portugal. Reparei que hoje quem procura vocês cai numa página de links genérica, e não num lugar com a marca de vocês.\n\nA gente faz as duas coisas de uma vez: uma página no domínio próprio de vocês, pensada para transformar visitas em pedidos, e um app simples para os clientes agendarem e acompanharem o que fazem com vocês. Valor fechado de criação e uma renovação anual pequena, sem mensalidade.\n\nQuerem ver um exemplo em 15 minutos? Agendem aqui: ${l}`,
    }),
    (e, l) => ({
      assunto: `Re: Uma página e um app com a marca da ${e}`,
      corpo: `Oi de novo,\n\nSó uma pergunta: hoje, quem chega na ${e} pelas redes consegue agendar ou pedir orçamento sem mandar mensagem? Se não consegue, é isso que a página e o app resolvem.\n\nSe fizer sentido, a agenda está aqui: ${l}`,
    }),
    (e, l) => ({
      assunto: `Encerrando por aqui`,
      corpo: `Oi,\n\nÚltimo e-mail sobre isso. Se não for o momento para a ${e}, não volto a insistir.\n\nSe um dia quiserem a página e o app de vocês, a agenda fica aqui: ${l}`,
    }),
  ],
  licenca_scanners: [
    (e, l) => ({
      assunto: `Scanners de trading com licença para a ${e}`,
      corpo: `Oi, pessoal da ${e},\n\nSou o Ricardo, da More Than Money (MTM), de Portugal. Desenvolvemos scanners de trading para TradingView e licenciamos para empresas de educação em trading, em pacote e por semestre, para usarem com os alunos de vocês.\n\nSe quiserem ir além, desenhamos e programamos a estratégia da casa de vocês, que fica de vocês, e um mentor de IA treinado nela para a comunidade. É isso que um curso no YouTube não consegue copiar.\n\nFaz sentido uma demonstração de 20 minutos? ${l}`,
    }),
    (e, l) => ({
      assunto: `Re: Scanners de trading com licença para a ${e}`,
      corpo: `Oi de novo,\n\nRetomando: a licença é por equipe, com o acesso gerido por nós e os alertas chegando onde os alunos de vocês já estão.\n\nQuem cuida de parcerias e produto na ${e}? Se for com vocês, a agenda está aqui: ${l}`,
    }),
    (e, l) => ({
      assunto: `Encerrando por aqui`,
      corpo: `Oi,\n\nÚltimo e-mail sobre as licenças. Se não for prioridade para a ${e}, não volto a insistir.\n\nSe mudar, a agenda fica aqui: ${l}`,
    }),
  ],
  parceria_redes: [
    (e, l) => ({
      assunto: `Colaboração com o @ricardogarciapt?`,
      corpo: `Oi, pessoal da ${e},\n\nSou o Ricardo Garcia, da More Than Money (MTM), de Portugal. No Instagram (@ricardogarciapt) falo de educação financeira, trading consciente e de como colocar a IA para trabalhar num negócio pequeno.\n\nQueria propor uma colaboração com a ${e}: um conteúdo em conjunto, uma entrevista ou uma série curta, com valor para as duas audiências. Sem compromisso antes de vermos se encaixa.\n\nFaz sentido a gente conversar? ${l}`,
    }),
    (e, l) => ({
      assunto: `Re: Colaboração com o @ricardogarciapt?`,
      corpo: `Oi de novo,\n\nSó retomando: quem cuida de colaborações e conteúdo na ${e}? Se for com vocês, agendamos 15 minutos: ${l}`,
    }),
    (e, l) => ({
      assunto: `Encerrando por aqui`,
      corpo: `Oi,\n\nÚltimo e-mail sobre essa colaboração. Se não for o momento para a ${e}, não volto a insistir.\n\nSe um dia fizer sentido: ${l}`,
    }),
  ],
}

/** Inglês: só os segmentos que fazem sentido fora do espaço lusófono. */
const INT: Partial<Record<Segmento, Tres>> = {
  negocio_local: [
    (e, l) => ({
      assunto: `A website and an app with ${e}'s own brand`,
      corpo: `Hi ${e} team,\n\nI'm Ricardo, from More Than Money (MTM), in Portugal. I noticed that people looking for you today land on a generic link page, not on a place with your own brand.\n\nWe do both in one go: a page on your own domain, built to turn visits into requests, and a small app where your clients book and follow what they do with you. One fixed setup price and a small yearly renewal, no monthly fees.\n\nWant to see an example in 15 minutes? You can book here: ${l}`,
    }),
    (e, l) => ({
      assunto: `Re: A website and an app with ${e}'s own brand`,
      corpo: `Hi again,\n\nOne quick question: today, can someone who finds ${e} on social media book or ask for a quote without messaging you? If not, that's exactly what the page and the app solve.\n\nIf it makes sense, you can book here: ${l}`,
    }),
    (e, l) => ({
      assunto: `Closing the loop`,
      corpo: `Hi,\n\nLast email about this. If the timing isn't right for ${e}, I won't follow up again.\n\nIf you ever want your own page and app, you can book here: ${l}`,
    }),
  ],
  licenca_scanners: [
    (e, l) => ({
      assunto: `Licensed trading scanners for ${e}`,
      corpo: `Hi ${e} team,\n\nI'm Ricardo, from More Than Money (MTM), in Portugal. We build trading scanners for TradingView and license them to trading education companies, as a bundle and per semester, for use with your students.\n\nIf you want to go further, we design and code your house strategy, which stays yours, plus an AI mentor trained on it for your community. That's something a free YouTube course can't copy.\n\nWould a 20-minute demo make sense? ${l}`,
    }),
    (e, l) => ({
      assunto: `Re: Licensed trading scanners for ${e}`,
      corpo: `Hi again,\n\nFollowing up on my last email: the licence is per team, with access managed by us and alerts delivered where your students already are.\n\nWho handles partnerships and product at ${e}? If it's you, you can book here: ${l}`,
    }),
    (e, l) => ({
      assunto: `Closing the loop`,
      corpo: `Hi,\n\nLast email about the licences. If it isn't a priority for ${e}, I won't follow up again.\n\nIf that changes, you can book here: ${l}`,
    }),
  ],
  parceria_redes: [
    (e, l) => ({
      assunto: `Collaboration with @ricardogarciapt?`,
      corpo: `Hi ${e} team,\n\nI'm Ricardo Garcia, from More Than Money (MTM), in Portugal. On Instagram (@ricardogarciapt) I talk about financial education, mindful trading and putting AI to work in small businesses.\n\nI'd like to propose a collaboration with ${e}: a joint piece of content, an interview or a short series that brings value to both audiences. No commitment on either side until we see it fits.\n\nWould it make sense to talk? ${l}`,
    }),
    (e, l) => ({
      assunto: `Re: Collaboration with @ricardogarciapt?`,
      corpo: `Hi again,\n\nJust following up: who handles collaborations and content at ${e}? If it's you, we can talk for 15 minutes: ${l}`,
    }),
    (e, l) => ({
      assunto: `Closing the loop`,
      corpo: `Hi,\n\nLast email about this collaboration. If the timing isn't right for ${e}, I won't follow up again.\n\nIf it ever makes sense: ${l}`,
    }),
  ],
}

/** Francês (17/11, Ricardo): França, Bélgica francófona, Suíça romanda, Luxemburgo. Tratamento por «vous». */
const FR: Partial<Record<Segmento, Tres>> = {
  negocio_local: [
    (e, l) => ({
      assunto: `Un site et une application à l'image de ${e}`,
      corpo: `Bonjour à l'équipe de ${e},\n\nJe suis Ricardo, de More Than Money (MTM), au Portugal. J'ai remarqué qu'aujourd'hui, les personnes qui vous cherchent arrivent sur une page de liens générique, et non sur un espace à votre image.\n\nNous faisons les deux en une fois : une page sur votre propre nom de domaine, pensée pour transformer les visites en demandes, et une petite application où vos clients réservent et suivent ce qu'ils font avec vous. Un prix de création fixe et un petit renouvellement annuel, sans abonnement mensuel.\n\nVoulez-vous voir un exemple en 15 minutes ? Vous pouvez réserver ici : ${l}`,
    }),
    (e, l) => ({
      assunto: `Re: Un site et une application à l'image de ${e}`,
      corpo: `Bonjour,\n\nUne seule question : aujourd'hui, quelqu'un qui découvre ${e} sur les réseaux peut-il réserver ou demander un devis sans vous écrire ? Si ce n'est pas le cas, c'est exactement ce que la page et l'application résolvent.\n\nSi cela vous parle, l'agenda est ici : ${l}`,
    }),
    (e, l) => ({
      assunto: `Je clôture ici`,
      corpo: `Bonjour,\n\nDernier e-mail à ce sujet. Si ce n'est pas le moment pour ${e}, je n'insisterai plus.\n\nSi un jour vous voulez votre propre page et votre application, l'agenda reste ici : ${l}`,
    }),
  ],
  licenca_scanners: [
    (e, l) => ({
      assunto: `Des scanners de trading sous licence pour ${e}`,
      corpo: `Bonjour à l'équipe de ${e},\n\nJe suis Ricardo, de More Than Money (MTM), au Portugal. Nous développons des scanners de trading pour TradingView et nous les concédons sous licence aux entreprises de formation au trading, en pack et par semestre, pour vos élèves.\n\nPour aller plus loin, nous concevons et programmons la stratégie de votre maison, qui reste la vôtre, ainsi qu'un mentor IA entraîné sur elle pour votre communauté. C'est ce qu'un cours gratuit sur YouTube ne peut pas copier.\n\nUne démonstration de 20 minutes aurait-elle du sens ? ${l}`,
    }),
    (e, l) => ({
      assunto: `Re: Des scanners de trading sous licence pour ${e}`,
      corpo: `Bonjour,\n\nJe reviens vers vous : la licence est par équipe, les accès sont gérés par nous et les alertes arrivent là où vos élèves sont déjà.\n\nQui s'occupe des partenariats et du produit chez ${e} ? Si c'est vous, vous pouvez réserver ici : ${l}`,
    }),
    (e, l) => ({
      assunto: `Je clôture ici`,
      corpo: `Bonjour,\n\nDernier e-mail au sujet des licences. Si ce n'est pas une priorité pour ${e}, je n'insisterai plus.\n\nSi cela change, vous pouvez réserver ici : ${l}`,
    }),
  ],
  parceria_redes: [
    (e, l) => ({
      assunto: `Une collaboration avec @ricardogarciapt ?`,
      corpo: `Bonjour à l'équipe de ${e},\n\nJe suis Ricardo Garcia, de More Than Money (MTM), au Portugal. Sur Instagram (@ricardogarciapt), je parle d'éducation financière, de trading réfléchi et d'IA au service des petites entreprises.\n\nJe voudrais proposer une collaboration à ${e} : un contenu commun, une interview ou une courte série qui apporte de la valeur aux deux audiences. Aucun engagement tant que nous ne voyons pas que cela convient.\n\nEst-ce que cela vaut un échange ? ${l}`,
    }),
    (e, l) => ({
      assunto: `Re: Une collaboration avec @ricardogarciapt ?`,
      corpo: `Bonjour,\n\nJe reviens vers vous : qui s'occupe des collaborations et du contenu chez ${e} ? Si c'est vous, nous pouvons en parler 15 minutes : ${l}`,
    }),
    (e, l) => ({
      assunto: `Je clôture ici`,
      corpo: `Bonjour,\n\nDernier e-mail au sujet de cette collaboration. Si le moment n'est pas le bon pour ${e}, je n'insisterai plus.\n\nSi un jour cela a du sens : ${l}`,
    }),
  ],
}

/** Alemão (17/11, Ricardo). Tratamento por «Sie». Na Alemanha e na Áustria o email frio a empresas exige consentimento: ver `exigeConsentimento`. */
const DE: Partial<Record<Segmento, Tres>> = {
  negocio_local: [
    (e, l) => ({
      assunto: `Eine Website und eine App im Auftritt von ${e}`,
      corpo: `Guten Tag, liebes Team von ${e},\n\nich bin Ricardo von More Than Money (MTM) aus Portugal. Mir ist aufgefallen, dass Menschen, die Sie suchen, heute auf einer allgemeinen Linkseite landen und nicht auf einer Seite mit Ihrer eigenen Marke.\n\nWir erledigen beides in einem Schritt: eine Seite unter Ihrer eigenen Domain, die Besuche in Anfragen verwandelt, und eine kleine App, in der Ihre Kunden Termine buchen und verfolgen. Ein fester Einrichtungspreis und eine kleine jährliche Verlängerung, ohne monatliche Gebühren.\n\nMöchten Sie in 15 Minuten ein Beispiel sehen? Hier können Sie einen Termin buchen: ${l}`,
    }),
    (e, l) => ({
      assunto: `Re: Eine Website und eine App im Auftritt von ${e}`,
      corpo: `Guten Tag,\n\nnur eine Frage: Kann jemand, der ${e} in den sozialen Netzwerken findet, heute einen Termin buchen oder ein Angebot anfragen, ohne Ihnen zu schreiben? Wenn nicht, genau das lösen die Seite und die App.\n\nWenn es passt, finden Sie den Kalender hier: ${l}`,
    }),
    (e, l) => ({
      assunto: `Ich schließe hier ab`,
      corpo: `Guten Tag,\n\nletzte E-Mail zu diesem Thema. Wenn es für ${e} gerade nicht passt, melde ich mich nicht mehr.\n\nWenn Sie irgendwann Ihre eigene Seite und App möchten, bleibt der Kalender hier: ${l}`,
    }),
  ],
  licenca_scanners: [
    (e, l) => ({
      assunto: `Lizenzierte Trading-Scanner für ${e}`,
      corpo: `Guten Tag, liebes Team von ${e},\n\nich bin Ricardo von More Than Money (MTM) aus Portugal. Wir entwickeln Trading-Scanner für TradingView und lizenzieren sie an Unternehmen der Trading-Ausbildung, als Paket und pro Semester, für den Einsatz mit Ihren Teilnehmern.\n\nWenn Sie weiter gehen möchten, entwerfen und programmieren wir Ihre hauseigene Strategie, die Ihnen gehört, dazu einen KI-Mentor, der darauf trainiert ist. Das kann kein kostenloser YouTube-Kurs kopieren.\n\nWäre eine Demo von 20 Minuten sinnvoll? ${l}`,
    }),
    (e, l) => ({
      assunto: `Re: Lizenzierte Trading-Scanner für ${e}`,
      corpo: `Guten Tag,\n\nich komme auf meine letzte E-Mail zurück: Die Lizenz gilt pro Team, die Zugänge verwalten wir, und die Signale kommen dort an, wo Ihre Teilnehmer schon sind.\n\nWer kümmert sich bei ${e} um Partnerschaften und Produkt? Wenn Sie es sind, können Sie hier buchen: ${l}`,
    }),
    (e, l) => ({
      assunto: `Ich schließe hier ab`,
      corpo: `Guten Tag,\n\nletzte E-Mail zu den Lizenzen. Wenn es für ${e} keine Priorität ist, melde ich mich nicht mehr.\n\nWenn sich das ändert, können Sie hier buchen: ${l}`,
    }),
  ],
  parceria_redes: [
    (e, l) => ({
      assunto: `Eine Zusammenarbeit mit @ricardogarciapt?`,
      corpo: `Guten Tag, liebes Team von ${e},\n\nich bin Ricardo Garcia von More Than Money (MTM) aus Portugal. Auf Instagram (@ricardogarciapt) spreche ich über Finanzbildung, bewusstes Trading und KI im Dienst kleiner Unternehmen.\n\nIch möchte ${e} eine Zusammenarbeit vorschlagen: ein gemeinsamer Beitrag, ein Interview oder eine kurze Serie, die beiden Zielgruppen etwas bringt. Keine Verpflichtung, bevor wir sehen, dass es passt.\n\nWäre ein kurzes Gespräch sinnvoll? ${l}`,
    }),
    (e, l) => ({
      assunto: `Re: Eine Zusammenarbeit mit @ricardogarciapt?`,
      corpo: `Guten Tag,\n\nkurz nachgefragt: Wer kümmert sich bei ${e} um Kooperationen und Inhalte? Wenn Sie es sind, können wir 15 Minuten sprechen: ${l}`,
    }),
    (e, l) => ({
      assunto: `Ich schließe hier ab`,
      corpo: `Guten Tag,\n\nletzte E-Mail zu dieser Zusammenarbeit. Wenn der Zeitpunkt für ${e} nicht passt, melde ich mich nicht mehr.\n\nWenn es irgendwann passt: ${l}`,
    }),
  ],
}

/** Italiano (17/11, Ricardo). Tratamento por «voi». Em Itália o email frio a empresas exige consentimento: ver `exigeConsentimento`. */
const IT: Partial<Record<Segmento, Tres>> = {
  negocio_local: [
    (e, l) => ({
      assunto: `Un sito e un'app con il marchio di ${e}`,
      corpo: `Buongiorno al team di ${e},\n\nsono Ricardo, di More Than Money (MTM), in Portogallo. Ho notato che oggi chi vi cerca arriva su una pagina di link generica, e non su uno spazio con il vostro marchio.\n\nFacciamo entrambe le cose in una volta: una pagina sul vostro dominio, pensata per trasformare le visite in richieste, e una piccola app dove i vostri clienti prenotano e seguono ciò che fanno con voi. Un prezzo di creazione fisso e un piccolo rinnovo annuale, senza canoni mensili.\n\nVolete vedere un esempio in 15 minuti? Potete prenotare qui: ${l}`,
    }),
    (e, l) => ({
      assunto: `Re: Un sito e un'app con il marchio di ${e}`,
      corpo: `Buongiorno,\n\nsolo una domanda: oggi chi trova ${e} sui social può prenotare o chiedere un preventivo senza scrivervi? Se non può, è proprio questo che la pagina e l'app risolvono.\n\nSe vi interessa, l'agenda è qui: ${l}`,
    }),
    (e, l) => ({
      assunto: `Chiudo qui`,
      corpo: `Buongiorno,\n\nultima email su questo tema. Se non è il momento per ${e}, non insisterò.\n\nSe un giorno vorrete la vostra pagina e la vostra app, l'agenda resta qui: ${l}`,
    }),
  ],
  licenca_scanners: [
    (e, l) => ({
      assunto: `Scanner di trading in licenza per ${e}`,
      corpo: `Buongiorno al team di ${e},\n\nsono Ricardo, di More Than Money (MTM), in Portogallo. Sviluppiamo scanner di trading per TradingView e li concediamo in licenza alle aziende di formazione sul trading, in pacchetto e a semestre, da usare con i vostri studenti.\n\nSe volete andare oltre, progettiamo e programmiamo la strategia della vostra casa, che resta vostra, insieme a un mentore IA addestrato su di essa per la vostra community. È ciò che un corso gratuito su YouTube non può copiare.\n\nAvrebbe senso una demo di 20 minuti? ${l}`,
    }),
    (e, l) => ({
      assunto: `Re: Scanner di trading in licenza per ${e}`,
      corpo: `Buongiorno,\n\nriprendo la mia email precedente: la licenza è per team, gli accessi li gestiamo noi e gli avvisi arrivano dove i vostri studenti sono già.\n\nChi segue partnership e prodotto in ${e}? Se siete voi, potete prenotare qui: ${l}`,
    }),
    (e, l) => ({
      assunto: `Chiudo qui`,
      corpo: `Buongiorno,\n\nultima email sulle licenze. Se non è una priorità per ${e}, non insisterò.\n\nSe cambia qualcosa, potete prenotare qui: ${l}`,
    }),
  ],
  parceria_redes: [
    (e, l) => ({
      assunto: `Una collaborazione con @ricardogarciapt?`,
      corpo: `Buongiorno al team di ${e},\n\nsono Ricardo Garcia, di More Than Money (MTM), in Portogallo. Su Instagram (@ricardogarciapt) parlo di educazione finanziaria, trading consapevole e IA al servizio delle piccole imprese.\n\nVorrei proporre a ${e} una collaborazione: un contenuto insieme, un'intervista o una breve serie che porti valore a entrambi i pubblici. Nessun impegno finché non vediamo che funziona.\n\nHa senso parlarne? ${l}`,
    }),
    (e, l) => ({
      assunto: `Re: Una collaborazione con @ricardogarciapt?`,
      corpo: `Buongiorno,\n\nriprendo brevemente: chi segue collaborazioni e contenuti in ${e}? Se siete voi, possiamo parlarne 15 minuti: ${l}`,
    }),
    (e, l) => ({
      assunto: `Chiudo qui`,
      corpo: `Buongiorno,\n\nultima email su questa collaborazione. Se non è il momento giusto per ${e}, non insisterò.\n\nSe un giorno avrà senso: ${l}`,
    }),
  ],
}

/** Há textos para este segmento nesta língua? */
export function temTextos(segmento: Segmento, pais: Pais): boolean {
  const outra = { INT, FR, DE, IT } as Record<string, Partial<Record<Segmento, Tres>>>
  return pais === 'PT' || pais === 'BR' ? true : !!outra[pais]?.[segmento]
}

const PT: Record<Segmento, [Escritor, Escritor, Escritor]> = {
  ...NOVOS_PT,
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
  ...NOVOS_BR,
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
  /** Dia (YYYY-MM-DD, Lisboa) para escolher a demo do dia. Por omissão, hoje. */
  hoje?: string
}

export interface Mensagem {
  assunto: string
  texto: string
  linkOferta: string
  linkSair: string
}

export function montarMensagem(p: PedidoMensagem): Mensagem {
  const id = p.identificacao ?? identificacaoDoAmbiente()
  const caminho = p.toque === 1 ? PAGINA_DA_OFERTA[p.segmento] : paginaDoSeguimento(p.segmento)
  const linkOferta = linkAssinado(caminho, AGENTE_B2B)
  const sair = linkSaida(p.email, p.segredo)
  const porLingua = { PT, BR, INT, FR, DE, IT } as Record<Pais, Partial<Record<Segmento, Tres>>>
  const textos = porLingua[p.pais][p.segmento]
  if (!textos) throw new Error(`Sem textos na língua ${p.pais} para o segmento ${p.segmento}.`)
  const { assunto, corpo } = textos[p.toque - 1](p.empresa.trim(), linkOferta)
  const emp = p.empresa.trim()
  const saidas: Record<Pais, string> = {
    PT: `Recebem este email por ser o contacto profissional publicado pela ${emp}. Para deixar de receber qualquer email da MTM, saiam aqui (um clique): ${sair}`,
    BR: `Você recebeu este e-mail por ser o contato profissional publicado pela ${emp}. Para não receber mais nada da MTM, saia aqui (um clique): ${sair}`,
    INT: `You are receiving this email because it is the business contact published by ${emp}. To stop receiving any email from MTM, unsubscribe here (one click): ${sair}`,
    FR: `Vous recevez cet e-mail car c'est le contact professionnel publié par ${emp}. Pour ne plus recevoir aucun e-mail de MTM, désinscrivez-vous ici (un clic) : ${sair}`,
    DE: `Sie erhalten diese E-Mail, weil es der von ${emp} veröffentlichte geschäftliche Kontakt ist. Um keine E-Mails mehr von MTM zu erhalten, melden Sie sich hier ab (ein Klick): ${sair}`,
    IT: `Ricevete questa email perché è il contatto professionale pubblicato da ${emp}. Per non ricevere più nessuna email da MTM, annullate l'iscrizione qui (un clic): ${sair}`,
  }
  const linhaSaida = saidas[p.pais]
  // 17/11 (Ricardo): o 1.º toque mostra a demo do dia que serve o segmento, se houver uma.
  const demo = p.toque === 1 ? demoDoDia(p.hoje, p.segmento) : null
  const linkDemo = demo ? linkAssinado(`/solucoes/demos/${demo.slug}`, AGENTE_B2B) : ''
  const psPorLingua: Record<Pais, string> = {
    PT: `PS: preparámos uma demonstração de 1 minuto que mostra uma automação destas a funcionar (${demo?.titulo}): ${linkDemo}`,
    BR: `PS: preparamos uma demonstração de 1 minuto que mostra uma automação destas funcionando (${demo?.titulo}): ${linkDemo}`,
    INT: `PS: here is a 1-minute demo of one of these automations at work (in Portuguese): ${linkDemo}`,
    FR: `PS : voici une démo d'une minute d'une de ces automatisations en action (en portugais) : ${linkDemo}`,
    DE: `PS: Hier ist eine einminütige Demo einer dieser Automatisierungen in Aktion (auf Portugiesisch): ${linkDemo}`,
    IT: `PS: ecco una demo di un minuto di una di queste automazioni in azione (in portoghese): ${linkDemo}`,
  }
  const ps = demo ? `\n\n${psPorLingua[p.pais]}` : ''
  const texto = `${corpo}${ps}\n\n—\n${id.assinante}\n${id.linhaLegal}\n\n${linhaSaida}`
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
