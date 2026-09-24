/**
 * A PORTA DO ADMIN NO TELEGRAM — quem entra, e o que fica escrito quando alguém mexe.
 *
 * O painel do bot deixou de ser só leitura: a partir de 24/09 decide depósitos, levantamentos e
 * ofertas de venda. A partir do momento em que um botão num telemóvel muda um registo de dinheiro,
 * três coisas passam a ser obrigatórias — e vivem todas aqui, num sítio só, para que nenhuma
 * função nova se possa esquecer de uma delas.
 *
 *  1. A PORTA VERIFICA-SE NO SERVIDOR, A CADA TOQUE. Não há estado de conversa, não há «já tinha
 *     entrado», não há botão que carregue consigo a autoridade de quem o mandou. `ehChatDeAdmin`
 *     compara o chat com `TELEGRAM_ADMIN_CHAT_ID` (UM chat), e isso não se alarga. A segunda parte
 *     da identidade — QUEM é esse chat na base — resolve-se pelo perfil do dono, que tem de ser
 *     `user_type = 'admin'` e estar activo. Se o perfil não existir ou deixar de ser admin, a porta
 *     fecha: retirar o admin no site tem de chegar para fechar o bot também.
 *
 *  2. O QUE ESCREVE PEDE DOIS TOQUES. O primeiro diz o que vai acontecer, em português e com o
 *     valor à frente; o segundo faz. Um polegar a passar por um ecrã não pode aprovar um
 *     levantamento.
 *
 *  3. O QUE ESCREVE FICA REGISTADO — e a intenção fica escrita ANTES de acontecer. Se o registo
 *     não se conseguir escrever, a acção não corre. `admin_centro_auditoria` é a mesma tabela do
 *     Centro de Controlo (095): as acções do dono pelo telemóvel aparecem na mesma lista das que
 *     ele faz pelo portátil, e não numa segunda história paralela.
 *
 * E UMA COISA QUE ISTO NÃO FAZ, E NUNCA VAI FAZER: mover dinheiro. Validar um depósito é mudar um
 * registo nosso — quem transfere, paga ou levanta é a corretora, com as mãos do dono. Um desenho
 * que precise de mover fundos para funcionar está errado antes de ser escrito.
 *
 *   npx tsx lib/__tests__/telegram-admin-porta.check.ts
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

type Supa = ReturnType<typeof getSupabaseAdmin>

/**
 * A tabela da auditoria do Centro de Controlo.
 *
 * É a MESMA de `lib/admin-centro/servidor/outros.ts` (`TABELA_AUDITORIA`). Está repetida em vez de
 * importada porque esse módulo arrasta o Centro inteiro (contas, estratégias, infra) para dentro do
 * webhook do Telegram, que tem de responder em segundos. O teste trava a divergência.
 */
export const TABELA_AUDITORIA = 'admin_centro_auditoria'

/** Prefixo de toda a acção vinda do bot — para se distinguirem na lista do /admin sem adivinhar. */
export const PREFIXO_ACCAO = 'telegram:'

/**
 * O email do dono na base. É por ele que o bot ganha uma identidade (uuid) para assinar o que faz.
 *
 * Não é uma segunda porta: quem já entrou provou ser o chat de `TELEGRAM_ADMIN_CHAT_ID`. Isto só
 * responde a «em nome de quem é que isto fica escrito» — e exige que esse perfil ainda seja admin.
 */
export const EMAIL_DO_DONO = process.env.TELEGRAM_ADMIN_EMAIL?.trim() || 'morethanmoneypt@gmail.com'

// ─────────────────────────────── A PORTA ───────────────────────────────

export interface Porta {
  chatId: string
  adminId: string
  adminEmail: string
}

export interface PortaFechada {
  /** O que se diz a quem bateu. A quem não é admin não se confirma sequer que a porta existe. */
  fechada: string
}

export function portaAberta(p: Porta | PortaFechada): p is Porta {
  return !('fechada' in p)
}

/** O perfil do dono muda raramente; relê-se de 5 em 5 minutos para não pesar em cada toque. */
let donoEmCache: { id: string; email: string; em: number } | null = null
const VALIDADE_CACHE_MS = 5 * 60_000

/** Esquece o perfil em cache (testes e mudanças de admin no site). */
export function esquecerDono(): void {
  donoEmCache = null
}

async function identidadeDoDono(supabase: Supa): Promise<{ id: string; email: string } | null> {
  if (donoEmCache && Date.now() - donoEmCache.em < VALIDADE_CACHE_MS) {
    return { id: donoEmCache.id, email: donoEmCache.email }
  }
  const { data } = await supabase
    .from('profiles')
    .select('id, email, user_type, is_active')
    .eq('email', EMAIL_DO_DONO)
    .maybeSingle()
  const p = data as { id?: string; email?: string; user_type?: string; is_active?: boolean } | null
  // Perdeu o admin no site ⇒ perde o bot. Uma porta que só se fecha num dos lados não está fechada.
  if (!p?.id || p.user_type !== 'admin' || p.is_active !== true) return null
  donoEmCache = { id: p.id, email: p.email ?? EMAIL_DO_DONO, em: Date.now() }
  return { id: donoEmCache.id, email: donoEmCache.email }
}

/**
 * Abre a porta para este chat — ou explica porque não.
 *
 * Chama-se a CADA toque, em cada função que lê ou escreve. Nunca se guarda o resultado entre
 * mensagens: guardá-lo era inventar uma sessão, e uma sessão é uma coisa que se rouba.
 */
export async function abrirPorta(supabase: Supa, chatId: string | number | null | undefined): Promise<Porta | PortaFechada> {
  // Importação tardia de propósito: o painel importa esta porta, e um ciclo no topo dos dois
  // módulos deixa um deles a meio quando o outro arranca.
  const { ehChatDeAdmin } = await import('@/lib/telegram-admin-menu')
  if (!(await ehChatDeAdmin(supabase, chatId))) return { fechada: '⛔ Sem permissão.' }
  const dono = await identidadeDoDono(supabase)
  if (!dono) {
    return {
      fechada:
        `⚠️ Não consigo assinar o que fizeres.\n\nO perfil <code>${EMAIL_DO_DONO}</code> não existe, ` +
        `não é <b>admin</b> ou está inactivo — e sem quem assine não há registo, e sem registo não mexo em nada.`,
    }
  }
  return { chatId: String(chatId), adminId: dono.id, adminEmail: dono.email }
}

// ─────────────────────────────── DOIS TOQUES ───────────────────────────────

export interface Botao {
  text: string
  callback_data?: string
  url?: string
}

export interface Confirmacao {
  texto: string
  teclado: { inline_keyboard: Botao[][] }
}

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export { esc as escaparHtml }

/**
 * Pura: a pergunta que antecede tudo o que escreve.
 *
 * Diz três coisas, por esta ordem, porque é esta a ordem em que uma pessoa decide: o que vai
 * acontecer, o que NÃO vai acontecer (é aqui que fica escrito que o bot não move dinheiro), e só
 * depois os botões. O «sim» é sempre o `!` da mesma acção; o «não» volta ao ecrã de onde veio.
 */
export function pedirConfirmacao(p: {
  titulo: string
  vaiAcontecer: string[]
  naoVaiAcontecer?: string[]
  fazer: string
  voltar: string
  rotuloSim?: string
}): Confirmacao {
  const linhas = [
    `⚠️ <b>Confirmas?</b>`,
    '',
    `<b>${esc(p.titulo)}</b>`,
    '',
    ...p.vaiAcontecer.map((l) => `✅ ${esc(l)}`),
  ]
  if (p.naoVaiAcontecer?.length) {
    linhas.push('', ...p.naoVaiAcontecer.map((l) => `🚫 ${esc(l)}`))
  }
  return {
    texto: linhas.join('\n'),
    teclado: {
      inline_keyboard: [
        [{ text: p.rotuloSim ?? '✅ Sim, confirmo', callback_data: p.fazer }],
        [{ text: '↩️ Não, voltar', callback_data: p.voltar }],
      ],
    },
  }
}

// ─────────────────────────────── A AUDITORIA ───────────────────────────────

export interface Intencao {
  /** Curto e estável — é por aqui que se procura na lista do /admin. Sem o prefixo. */
  acao: string
  /** Sobre o quê. `lead:123456`, `levantamento:<uuid>`, `perfil:<uuid>`. */
  alvo: string
  /** O pedido, como o dono o fez. Nunca leva fotos, passwords nem texto livre de terceiros. */
  pedido: Record<string, unknown>
  /** O estado antes de mexer. É metade do valor de um registo — a outra metade é o depois. */
  antes?: unknown
}

export interface Registo {
  id: number
}

/**
 * Escreve a INTENÇÃO e devolve o registo — ou `null` se não conseguiu escrever.
 *
 * `null` significa «não ages». Não é um aviso: é a resposta. O Centro de Controlo pode dar-se ao
 * luxo de cair para os logs da Vercel quando a tabela falta, porque as acções dele têm um ecrã
 * inteiro à volta e um humano a olhar; uma decisão tomada num autocarro, com o polegar, não tem.
 */
export async function abrirRegisto(porta: Porta, i: Intencao): Promise<Registo | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from(TABELA_AUDITORIA)
      .insert({
        admin_id: porta.adminId,
        acao: `${PREFIXO_ACCAO}${i.acao}`.slice(0, 80),
        alvo: i.alvo.slice(0, 200),
        pedido: { ...i.pedido, chat: porta.chatId, antes: i.antes ?? null },
        ok: false,
      })
      .select('id')
      .single()
    if (error || !data) {
      console.error('[telegram-admin] auditoria não abriu:', error?.message ?? 'sem linha')
      return null
    }
    return { id: Number(data.id) }
  } catch (e) {
    console.error('[telegram-admin] auditoria não abriu:', e)
    return null
  }
}

/** Fecha o registo com o que aconteceu. Falhar a fechar grita nos logs, mas não desfaz a acção. */
export async function fecharRegisto(
  registo: Registo,
  f: { ok: boolean; depois?: unknown; resultado?: unknown },
): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin()
      .from(TABELA_AUDITORIA)
      .update({ ok: f.ok, resultado: { ...(f.resultado as object | null ?? {}), depois: f.depois ?? null } })
      .eq('id', registo.id)
    if (error) console.error('[telegram-admin] auditoria não fechou', registo.id, error.message)
  } catch (e) {
    console.error('[telegram-admin] auditoria não fechou', registo.id, e)
  }
}

/**
 * O envelope de tudo o que escreve: intenção → acção → registo fechado.
 *
 * Quem chama não tem de se lembrar da ordem, nem de tratar do caso em que a auditoria falha. Se o
 * registo não abriu, a acção nem sequer é chamada e a resposta explica-o em voz alta.
 */
export async function comRegisto<T>(
  porta: Porta,
  i: Intencao,
  accao: () => Promise<{ ok: boolean; texto: string; depois?: unknown; resultado?: unknown }>,
): Promise<{ ok: boolean; texto: string }> {
  const registo = await abrirRegisto(porta, i)
  if (!registo) {
    return {
      ok: false,
      texto:
        '⚠️ <b>Não fiz nada.</b>\n\nNão consegui escrever o registo desta acção, e o que mexe em ' +
        'dinheiro ou em acessos não corre sem ficar registado. Tenta outra vez; se persistir, faz pelo /admin.',
    }
  }
  try {
    const r = await accao()
    await fecharRegisto(registo, { ok: r.ok, depois: r.depois, resultado: r.resultado })
    return { ok: r.ok, texto: r.texto }
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e)
    await fecharRegisto(registo, { ok: false, resultado: { erro } })
    return { ok: false, texto: `⚠️ Falhou: ${esc(erro)}` }
  }
}
