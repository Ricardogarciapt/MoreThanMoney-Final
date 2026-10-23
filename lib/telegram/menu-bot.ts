/**
 * O MENU DO BOT DA CASA (@MoreThanMoney_aibot), editável em Gestão → Telegram → Menu do bot.
 *
 * Duas espécies de comandos:
 *   · os de BASE — o webhook (app/api/telegram/webhook/route.ts) já lhes responde com lógica
 *     própria. Aqui só se muda a descrição e se aparecem ou não no menu «/». Inventar um comando
 *     de base que o webhook não conhece era anunciar uma porta que não abre.
 *   · os EXTRA — criados no painel, com uma resposta fixa e botões de link. O webhook procura-os
 *     antes de dizer «não conheço esse comando».
 *
 * Guarda-se em site_settings `telegram_bot_menu`. Sem nada guardado, o menu é o de sempre.
 * A parte pura (validar, escapar) testa-se com `npx tsx lib/telegram/menu-bot.check.ts`.
 */
import { COMANDOS_DO_DONO, COMANDOS_EQUIPA } from '@/lib/backoffice-telegram-comandos'

export const CHAVE_MENU = 'telegram_bot_menu'

export const COMANDOS_BASE = [
  { command: 'start', description: 'Começar e ligar ao assistente MTM' },
  { command: 'premium', description: 'Packs, preços e como entrar' },
  { command: 'grupos', description: 'Aceder aos grupos de sinais' },
  { command: 'sinais', description: 'Ver os últimos sinais de trading' },
  { command: 'mtmauto', description: 'Só a app que copia os sinais por ti' },
  { command: 'corretora', description: 'Abrir conta na corretora (PU Prime)' },
  { command: 'app', description: 'Descarregar a app e experimentar' },
  { command: 'status', description: 'Estado da tua ligação e do teu acesso' },
  { command: 'ajuda', description: 'Ajuda e comandos disponíveis' },
] as const

export const DESCRICAO_BASE = 'Bot oficial MoreThanMoney — Sinais de trading, ligação com mentores e atualizações da plataforma.'
export const DESCRICAO_CURTA_BASE = 'Sinais MTM & ligação ao mentor'

export type ComandoBase = { command: string; description: string; visivel: boolean }
export type Botao = { texto: string; url: string }
export type ComandoExtra = { command: string; description: string; resposta: string; botoes: Botao[]; visivel: boolean }
export type MenuBot = {
  base: ComandoBase[]
  extras: ComandoExtra[]
  descricao: string
  descricaoCurta: string
  /** Botão azul ao lado do campo de escrita. `null` = o de sempre (lista de comandos). */
  botaoMenu: Botao | null
  publicadoEm?: string | null
}

export function menuPorOmissao(): MenuBot {
  return {
    base: COMANDOS_BASE.map((c) => ({ ...c, visivel: true })),
    extras: [],
    descricao: DESCRICAO_BASE,
    descricaoCurta: DESCRICAO_CURTA_BASE,
    botaoMenu: null,
    publicadoEm: null,
  }
}

/** Nomes que um extra não pode usar: os de base, os do dono e os da equipa (e os seus aliases). */
const RESERVADOS = new Set<string>([
  ...COMANDOS_BASE.map((c) => c.command),
  'auto', 'teste', 'trial', 'sinal', 'acesso', 'conta', 'ligar', 'liguem', 'chamada', 'help', 'comandos',
  ...COMANDOS_DO_DONO.map((c) => c.replace('/', '')),
  ...COMANDOS_EQUIPA.map((c) => c.nome.replace('/', '')),
])

const URL_OK = /^https:\/\/[^\s]+$/i

/** Junta o que vem do painel ao menu de base. Nunca inventa comandos de base. */
export function validarMenu(entrada: unknown): { ok: true; menu: MenuBot } | { ok: false; erro: string } {
  const e = (entrada ?? {}) as Partial<MenuBot>
  const omissao = menuPorOmissao()
  const pedidos = new Map((Array.isArray(e.base) ? e.base : []).map((c) => [String(c?.command), c]))
  const base = omissao.base.map((c) => {
    const p = pedidos.get(c.command)
    const description = String(p?.description ?? c.description).trim().slice(0, 256) || c.description
    return { command: c.command, description, visivel: p ? p.visivel !== false : true }
  })

  const extras: ComandoExtra[] = []
  const vistos = new Set<string>()
  for (const x of Array.isArray(e.extras) ? e.extras : []) {
    const command = String(x?.command ?? '').trim().replace(/^\//, '').toLowerCase()
    if (!/^[a-z0-9_]{2,32}$/.test(command)) return { ok: false, erro: `/${command || '?'}: o comando leva só letras, números e _ (2 a 32).` }
    if (RESERVADOS.has(command)) return { ok: false, erro: `/${command} já é um comando do bot.` }
    if (vistos.has(command)) return { ok: false, erro: `/${command} aparece duas vezes.` }
    vistos.add(command)
    const description = String(x?.description ?? '').trim().slice(0, 256)
    const resposta = String(x?.resposta ?? '').trim().slice(0, 3500)
    if (!description) return { ok: false, erro: `/${command}: falta a descrição.` }
    if (!resposta) return { ok: false, erro: `/${command}: falta a resposta.` }
    const botoes: Botao[] = []
    for (const b of Array.isArray(x?.botoes) ? x.botoes : []) {
      const texto = String(b?.texto ?? '').trim().slice(0, 40)
      const url = String(b?.url ?? '').trim()
      if (!texto && !url) continue
      if (!texto || !URL_OK.test(url)) return { ok: false, erro: `/${command}: cada botão precisa de texto e de um link https.` }
      botoes.push({ texto, url })
    }
    if (botoes.length > 6) return { ok: false, erro: `/${command}: no máximo 6 botões.` }
    extras.push({ command, description, resposta, botoes, visivel: x?.visivel !== false })
  }
  if (extras.length > 20) return { ok: false, erro: 'No máximo 20 comandos extra.' }

  let botaoMenu: Botao | null = null
  if (e.botaoMenu && (e.botaoMenu.texto || e.botaoMenu.url)) {
    const texto = String(e.botaoMenu.texto ?? '').trim().slice(0, 30)
    const url = String(e.botaoMenu.url ?? '').trim()
    if (!texto || !URL_OK.test(url)) return { ok: false, erro: 'O botão do menu precisa de texto e de um link https.' }
    botaoMenu = { texto, url }
  }

  return {
    ok: true,
    menu: {
      base,
      extras,
      descricao: String(e.descricao ?? omissao.descricao).trim().slice(0, 512) || omissao.descricao,
      descricaoCurta: String(e.descricaoCurta ?? omissao.descricaoCurta).trim().slice(0, 120) || omissao.descricaoCurta,
      botaoMenu,
      publicadoEm: e.publicadoEm ?? null,
    },
  }
}

/** O que vai para o setMyCommands: base visíveis + extras visíveis. */
export function comandosDoMenu(menu: MenuBot) {
  return [
    ...menu.base.filter((c) => c.visivel).map(({ command, description }) => ({ command, description })),
    ...menu.extras.filter((c) => c.visivel).map(({ command, description }) => ({ command, description })),
  ]
}

const escapar = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** A resposta de um extra, pronta para o sendMessage (parse_mode HTML). `null` = não é um extra. */
export function respostaDoExtra(menu: MenuBot, texto: string): { texto: string; teclado?: unknown } | null {
  const command = texto.trim().split(/[\s@]/)[0].replace(/^\//, '').toLowerCase()
  const x = menu.extras.find((e) => e.command === command)
  if (!x) return null
  return {
    texto: escapar(x.resposta),
    ...(x.botoes.length ? { teclado: { inline_keyboard: x.botoes.map((b) => [{ text: b.texto, url: b.url }]) } } : {}),
  }
}
