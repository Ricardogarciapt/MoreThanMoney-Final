/**
 * Vídeos do YouTube na língua de quem vê (17/11/2026).
 *
 * As aulas gravadas são do Ricardo, em português. O YouTube já tem legendas (as automáticas e as
 * que se carregam noutras línguas — «vídeos novos com CC nas outras línguas»); faltava pedir ao
 * leitor que as ligasse no idioma do aluno. `cc_load_policy=1` liga as legendas, `cc_lang_pref`
 * escolhe a língua e `hl` põe o próprio leitor nessa língua. Para PT não se mexe em nada.
 */
export function comLegendasYouTube(url: string, lang: string): string {
  if (!url || !lang || lang === "pt") return url
  try {
    const u = new URL(url)
    if (!/(^|\.)youtube(-nocookie)?\.com$/i.test(u.hostname)) return url
    const codigo = lang === "zh-CN" ? "zh-Hans" : lang
    u.searchParams.set("cc_load_policy", "1")
    u.searchParams.set("cc_lang_pref", codigo)
    u.searchParams.set("hl", codigo)
    return u.toString()
  } catch {
    return url
  }
}
