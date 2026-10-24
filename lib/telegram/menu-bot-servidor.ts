import type { SupabaseClient } from '@supabase/supabase-js'
import { CHAVE_MENU, comandosDoMenu, menuPorOmissao, validarMenu, type MenuBot } from '@/lib/telegram/menu-bot'

/**
 * O lado de rede do menu do bot: ler/gravar em site_settings e publicar no Telegram.
 * A regra do que é um menu válido vive em `lib/telegram/menu-bot.ts`.
 */
const TG = 'https://api.telegram.org/bot'
const ADMIN_CHAT = () => process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || '1446687230'

export async function lerMenu(db: SupabaseClient): Promise<MenuBot> {
  try {
    const { data } = await db.from('site_settings').select('value').eq('key', CHAVE_MENU).maybeSingle()
    if (!data?.value) return menuPorOmissao()
    const v = validarMenu(data.value)
    return v.ok ? v.menu : menuPorOmissao()
  } catch {
    return menuPorOmissao()
  }
}

export async function gravarMenu(db: SupabaseClient, menu: MenuBot) {
  return db.from('site_settings').upsert({ key: CHAVE_MENU, value: menu }, { onConflict: 'key' })
}

async function chamar(token: string, metodo: string, corpo: unknown) {
  const r = await fetch(`${TG}${token}/${metodo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  const d = (await r.json().catch(() => ({}))) as { ok?: boolean; description?: string }
  return { metodo, ok: d.ok === true, erro: d.ok ? null : d.description ?? `HTTP ${r.status}` }
}

/**
 * Publica o menu: comandos em todos os âmbitos (com e sem pt), o menu do dono só no privado dele
 * (com /admin e /painel), descrições e o botão do menu.
 */
export async function publicarMenu(token: string, menu: MenuBot) {
  const comandos = comandosDoMenu(menu)
  const ambitos = [{ type: 'default' }, { type: 'all_private_chats' }, { type: 'all_group_chats' }]
  const resultados = []
  for (const scope of ambitos) {
    resultados.push(await chamar(token, 'setMyCommands', { commands: comandos, scope, language_code: 'pt' }))
    resultados.push(await chamar(token, 'setMyCommands', { commands: comandos, scope }))
  }
  resultados.push(await chamar(token, 'setMyCommands', {
    commands: [...comandos, { command: 'admin', description: 'Painel de administração MTM' }, { command: 'painel', description: 'Painel de administração MTM' }],
    scope: { type: 'chat', chat_id: Number(ADMIN_CHAT()) },
  }))
  resultados.push(await chamar(token, 'setMyDescription', { description: menu.descricao, language_code: 'pt' }))
  resultados.push(await chamar(token, 'setMyShortDescription', { short_description: menu.descricaoCurta, language_code: 'pt' }))
  resultados.push(await chamar(token, 'setChatMenuButton', {
    menu_button: menu.botaoMenu ? { type: 'web_app', text: menu.botaoMenu.texto, web_app: { url: menu.botaoMenu.url } } : { type: 'commands' },
  }))
  return { ok: resultados.every((r) => r.ok), resultados, comandos }
}
