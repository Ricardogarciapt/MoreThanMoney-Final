/**
 * Complemento do dicionário estático: os textos que a IA traduziu para os idiomas sem tradução à
 * mão (GET /api/i18n/auto). Fica em memória e em localStorage, para a segunda abertura da app já
 * vir no idioma certo sem esperar pela rede.
 */
import type { Lang } from "./config"

const auto = new Map<string, Record<string, string>>()
const CHAVE_LS = (lang: string) => `mtm_i18n_auto_${lang}`

export function textoAuto(lang: Lang, key: string): string | undefined {
  return auto.get(lang)?.[key]
}

/** Lê a cópia local (síncrono) — chamado antes do primeiro render que precisa dela. */
export function carregarAutoLocal(lang: Lang): boolean {
  if (auto.has(lang) || typeof window === "undefined") return auto.has(lang)
  try {
    const raw = window.localStorage.getItem(CHAVE_LS(lang))
    if (raw) {
      auto.set(lang, JSON.parse(raw) as Record<string, string>)
      return true
    }
  } catch {
    /* ignore */
  }
  return false
}

/** Vai buscar a versão do servidor; devolve true se trouxe textos novos (para re-render). */
export async function actualizarAuto(lang: Lang): Promise<boolean> {
  if (lang === "pt" || lang === "en") return false
  try {
    const r = await fetch(`/api/i18n/auto?lang=${encodeURIComponent(lang)}`)
    if (!r.ok) return false
    const { textos } = (await r.json()) as { textos?: Record<string, string> }
    if (!textos) return false
    const antes = auto.get(lang)
    const mudou = !antes || Object.keys(textos).length !== Object.keys(antes).length ||
      Object.entries(textos).some(([k, v]) => antes[k] !== v)
    if (!mudou) return false
    auto.set(lang, textos)
    try {
      window.localStorage.setItem(CHAVE_LS(lang), JSON.stringify(textos))
    } catch {
      /* cheio ou bloqueado: fica só em memória */
    }
    return true
  } catch {
    return false
  }
}
