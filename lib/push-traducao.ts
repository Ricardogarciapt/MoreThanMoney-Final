/**
 * Notificações push na língua de cada aluno (17/11/2026).
 *
 * Os avisos saem do servidor em PT (sinais, sessões ao vivo, chat, MTM Funded…). Aqui agrupam-se
 * os destinatários pelo idioma do perfil e traduz-se o título e o corpo UMA vez por idioma.
 *
 * Regra da casa: nada lento antes da entrega. Por isso:
 *  - quem está em PT (a maioria) recebe logo, sem esperar por traduções;
 *  - para os outros, primeiro a cache `chat_traducoes`, depois o Google grátis com tecto de 1,5 s
 *    (não a IA: um sinal não pode esperar 5 s); se nada responder a tempo, vai o original.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeLang } from '@/lib/i18n/config'
import { googleGratis, hashTexto } from '@/lib/chat-traducao'

const TECTO_MS = 1500

/** user_id → idioma (PT por omissão), lido de uma vez. Falha de leitura = todos em PT. */
export async function agruparPorIdioma(sb: SupabaseClient, userIds: string[]): Promise<Map<string, string[]>> {
  const grupos = new Map<string, string[]>()
  if (userIds.length === 0) return grupos
  const idiomaDe = new Map<string, string>()
  for (let i = 0; i < userIds.length; i += 500) {
    const { data, error } = await sb
      .from('profiles')
      .select('id, preferred_language')
      .in('id', userIds.slice(i, i + 500))
    if (error) break
    for (const r of data ?? []) idiomaDe.set(r.id as string, normalizeLang(r.preferred_language as string | null))
  }
  for (const id of userIds) {
    const l = idiomaDe.get(id) ?? 'pt'
    const lista = grupos.get(l) ?? []
    lista.push(id)
    grupos.set(l, lista)
  }
  return grupos
}

/** Título e corpo no idioma `lang`; o que não for possível traduzir a tempo fica como está. */
export async function traduzirPush(
  sb: SupabaseClient,
  textos: { title: string; body: string },
  lang: string,
): Promise<{ title: string; body: string }> {
  if (lang === 'pt') return textos
  const originais = [textos.title, textos.body]
  const hashes = originais.map(hashTexto)
  const finais = [...originais]
  try {
    const { data } = await sb
      .from('chat_traducoes')
      .select('hash, traducao, mesmo_idioma')
      .eq('idioma', lang)
      .in('hash', hashes)
    const cache = new Map((data ?? []).map((r) => [r.hash as string, r]))
    const novas: { hash: string; idioma: string; traducao: string; mesmo_idioma: boolean }[] = []
    await Promise.all(
      originais.map(async (texto, i) => {
        if (!/\p{L}{3,}/u.test(texto)) return
        const c = cache.get(hashes[i])
        if (c) {
          if (!c.mesmo_idioma) finais[i] = c.traducao as string
          return
        }
        const tr = await googleGratis(texto, lang, TECTO_MS)
        if (!tr) return
        const mesmo = tr.mesmoIdioma || tr.traducao.trim() === texto.trim()
        if (!mesmo) finais[i] = tr.traducao
        novas.push({ hash: hashes[i], idioma: lang, traducao: tr.traducao, mesmo_idioma: mesmo })
      }),
    )
    if (novas.length) {
      // Não se espera pela gravação da cache: o aviso segue já.
      void sb.from('chat_traducoes').upsert(novas, { onConflict: 'hash,idioma' }).then(() => {}, () => {})
    }
  } catch {
    /* fica o original */
  }
  return { title: finais[0], body: finais[1] }
}
