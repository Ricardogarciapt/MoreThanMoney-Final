/**
 * Cookie do Google Translate — serve as páginas que ainda não passaram para o dicionário
 * nativo. Vive aqui (e não dentro de um seletor) porque agora há mais do que um sítio a
 * escolher idioma: navbar, registo e upgrade têm de escrever o cookie exactamente da mesma
 * maneira, senão a segunda troca fica presa no idioma anterior.
 */

/** www.morethanmoney.pt → morethanmoney.pt (mantém localhost/IP como está). */
function rootDomain(host: string): string {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host
  const parts = host.split(".")
  if (parts.length <= 2) return host
  return parts.slice(-2).join(".")
}

/**
 * Apaga o googtrans em TODOS os scopes: host-only, domínio exacto, e domínio raiz com e sem
 * ponto. É o ponto que faltava — o Google grava em `.morethanmoney.pt` e o código antigo
 * nunca limpava esse.
 */
export function clearGoogtransCookies(): void {
  if (typeof document === "undefined") return
  const host = window.location.hostname
  const root = rootDomain(host)
  const expirado = "expires=Thu, 01 Jan 1970 00:00:00 GMT"
  for (const scope of ["", `; domain=${host}`, `; domain=.${host}`, `; domain=${root}`, `; domain=.${root}`]) {
    document.cookie = `googtrans=; path=/${scope}; ${expirado}`
  }
}

/** Escreve o googtrans em host-only + domínio raiz com ponto. */
export function setGoogtransCookie(value: string): void {
  if (typeof document === "undefined") return
  const root = rootDomain(window.location.hostname)
  const maxAge = "max-age=31536000"
  document.cookie = `googtrans=${value}; path=/; ${maxAge}`
  document.cookie = `googtrans=${value}; path=/; domain=.${root}; ${maxAge}`
}

/**
 * Aplica o idioma às páginas ainda servidas pelo Google Translate. Português é a fonte:
 * limpa o cookie e não traduz nada.
 */
export function applyGoogleTranslate(lang: string): void {
  clearGoogtransCookies()
  if (lang && lang !== "pt") setGoogtransCookie(`/pt/${lang}`)
}
