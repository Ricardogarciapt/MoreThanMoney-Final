/**
 * Dicionário automático para os idiomas que ainda não têm tradução feita à mão (17/11/2026).
 *
 * Porquê: a app tem ~2.100 textos em PT e EN, mas os outros 19 idiomas só têm ~920 — o resto caía
 * para PT e um alemão ou um polaco instalava a app e via português. Aqui a IA grátis traduz o que
 * falta UMA vez por idioma e grava em `i18n_auto`; os ecrãs lêem a cache (GET /api/i18n/auto).
 *
 * Fonte = texto PT (é o original, com o tom «tu»), com o EN ao lado como pista. Se o texto PT mudar,
 * o `fonte_hash` deixa de bater e a chave volta a ser traduzida na próxima volta do cron.
 * Custo: só corre enquanto houver chaves em falta; com tudo traduzido o cron faz uma consulta e sai.
 */
import { createHash } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { chamarIAGratis, mensagemIndisponivel } from "@/lib/ia/chamar"
import { LANGUAGE_NAMES_EN } from "@/lib/chat-traducao-idiomas"
import { ALL_MESSAGES } from "./registry"
import { I18N_LANGS, type Lang } from "./config"
import { PRIORITY_LANGS } from "./languages"
import { NOMES_FIXOS, traducaoValida } from "./auto-validar"

/** Idiomas que o cron preenche: todos menos PT (fonte) e EN (completo à mão). Prioritários primeiro. */
export const IDIOMAS_AUTO: Lang[] = [
  ...PRIORITY_LANGS.filter((l) => l !== "pt" && l !== "en"),
  "it",
  "nl",
  ...I18N_LANGS.filter((l) => !["pt", "en", "es", "de", "fr", "it", "nl"].includes(l)),
]

const LOTE = 25

/** Linha marcadora por idioma: «com este dicionário, já não falta nada» — o cron salta sem ler o resto. */
const ASSINATURA = "__assinatura__"

/** Muda sempre que muda o conjunto de chaves em falta ou o texto PT de alguma delas. */
export function assinatura(falta: Record<string, string>): string {
  return hashFonte(JSON.stringify(Object.entries(falta).sort(([a], [b]) => a.localeCompare(b))))
}

export function hashFonte(texto: string): string {
  return createHash("sha256").update(texto).digest("hex").slice(0, 16)
}

/** Chaves que o dicionário estático não tem neste idioma → { chave: textoPT }. */
export function chavesEmFalta(lang: Lang): Record<string, string> {
  const pt = ALL_MESSAGES.pt
  const dest = ALL_MESSAGES[lang] ?? {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(pt)) if (dest[k] === undefined && v.trim()) out[k] = v
  return out
}

const SISTEMA =
  "You localise the user interface of a financial-education and trading app (MoreThanMoney). " +
  "Translate each UI string from European Portuguese into the target language: short, natural, informal " +
  "(second person singular where the language has it), as a native app would say it. The English version is " +
  "given as a hint for meaning. Keep EXACTLY every {placeholder} (e.g. {n}, {erro}), markdown (**bold**), " +
  "line breaks, emojis, numbers, URLs. NEVER translate these names: " +
  NOMES_FIXOS.join(", ") +
  ", nor names of scanners, educators, courses, tickers (XAUUSD, BTC…) or trading terms (TP, SL, BE, pips, lot). " +
  "Return ONLY valid JSON, no markdown."

async function traduzirLote(
  itens: { k: string; pt: string; en: string }[],
  lang: Lang,
): Promise<Record<string, string>> {
  const nome = LANGUAGE_NAMES_EN[lang] || lang
  const r = await chamarIAGratis({
    tarefa: "i18n-auto",
    sistema: SISTEMA,
    mensagens: [
      {
        role: "user",
        content:
          `Target language: ${nome} (${lang}).\n` +
          `Answer as {"items":[{"i":<index>,"t":"<translation>"}]} with every index.\n\n` +
          JSON.stringify(itens.map((x, i) => ({ i, pt: x.pt, en: x.en }))),
      },
    ],
    json: true,
    temperatura: 0.1,
    maxTokens: 4000,
    preferencia: "qualidade",
    timeoutMs: 25000,
  })
  const o = JSON.parse(r.texto) as { items?: { i?: unknown; t?: unknown }[] }
  const out: Record<string, string> = {}
  for (const it of o.items ?? []) {
    const i = Number(it.i)
    const item = Number.isInteger(i) ? itens[i] : undefined
    if (item && traducaoValida(item.pt, it.t)) out[item.k] = (it.t as string).trim()
  }
  return out
}

type Linha = { idioma: string; chave: string; fonte_hash: string; texto: string }

/** O que já está traduzido e válido (hash da fonte actual) neste idioma. */
export async function lerAuto(sb: SupabaseClient, lang: Lang): Promise<Record<string, string>> {
  const falta = chavesEmFalta(lang)
  const out: Record<string, string> = {}
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("i18n_auto")
      .select("chave, fonte_hash, texto")
      .eq("idioma", lang)
      .range(from, from + 999)
    if (error || !data?.length) break
    for (const r of data) {
      const pt = falta[r.chave as string]
      if (pt !== undefined && hashFonte(pt) === r.fonte_hash) out[r.chave as string] = r.texto as string
    }
    if (data.length < 1000) break
  }
  return out
}

/**
 * Uma volta do cron: traduz até `limite` chaves em falta, idioma a idioma (prioritários primeiro).
 * Devolve o que fez e quanto ainda falta, para o admin ver o progresso.
 */
export async function preencherAuto(
  sb: SupabaseClient,
  opts: { limite?: number; lang?: Lang } = {},
): Promise<{ traduzidas: number; falhadas: number; faltam: Record<string, number> }> {
  const limite = Math.max(LOTE, Math.min(opts.limite ?? 150, 400))
  const idiomas = opts.lang ? [opts.lang] : IDIOMAS_AUTO
  const en = ALL_MESSAGES.en
  let orcamento = limite
  let traduzidas = 0
  let falhadas = 0
  const faltam: Record<string, number> = {}

  // Uma só leitura pequena: que idiomas já estão completos para o dicionário actual.
  const { data: marcas } = await sb.from("i18n_auto").select("idioma, fonte_hash").eq("chave", ASSINATURA)
  const completos = new Map((marcas ?? []).map((m) => [m.idioma as string, m.fonte_hash as string]))

  for (const lang of idiomas) {
    const falta = chavesEmFalta(lang)
    const assin = assinatura(falta)
    if (completos.get(lang) === assin) {
      faltam[lang] = 0
      continue
    }
    if (orcamento <= 0) continue
    const feitas = await lerAuto(sb, lang)
    const pendentes = Object.keys(falta).filter((k) => feitas[k] === undefined)
    faltam[lang] = pendentes.length
    if (!pendentes.length) {
      await sb
        .from("i18n_auto")
        .upsert({ idioma: lang, chave: ASSINATURA, fonte_hash: assin, texto: "" }, { onConflict: "idioma,chave" })
      continue
    }

    const agora = pendentes.slice(0, orcamento)
    orcamento -= agora.length
    const lotes: { k: string; pt: string; en: string }[][] = []
    for (let i = 0; i < agora.length; i += LOTE) {
      lotes.push(agora.slice(i, i + LOTE).map((k) => ({ k, pt: falta[k], en: en[k] ?? "" })))
    }
    // 3 lotes de cada vez: rápido o suficiente sem esgotar o limite por minuto do Groq.
    for (let i = 0; i < lotes.length; i += 3) {
      const res = await Promise.all(
        lotes.slice(i, i + 3).map((l) =>
          traduzirLote(l, lang).catch((err) => {
            console.warn(`[i18n-auto] ${lang}: IA falhou —`, mensagemIndisponivel(err))
            return {} as Record<string, string>
          }),
        ),
      )
      const linhas: Linha[] = []
      res.forEach((r, j) => {
        for (const item of lotes[i + j]) {
          const t = r[item.k]
          if (t) linhas.push({ idioma: lang, chave: item.k, fonte_hash: hashFonte(item.pt), texto: t })
          else falhadas++
        }
      })
      if (linhas.length) {
        const { error } = await sb.from("i18n_auto").upsert(linhas, { onConflict: "idioma,chave" })
        if (error) console.warn("[i18n-auto] gravação falhou:", error.message)
        else {
          traduzidas += linhas.length
          faltam[lang] -= linhas.length
        }
      }
    }
    // Tentou-se tudo o que faltava e sobram só umas teimosas (marcador perdido, IA que insiste em
    // traduzir um nome): ficam em inglês e o idioma dá-se por fechado, para não gastar IA em cada volta.
    if (agora.length === pendentes.length && faltam[lang] <= 15) {
      await sb
        .from("i18n_auto")
        .upsert({ idioma: lang, chave: ASSINATURA, fonte_hash: assin, texto: "" }, { onConflict: "idioma,chave" })
    }
  }
  return { traduzidas, falhadas, faltam }
}
