/**
 * UMA SESSÃO SÓ DENTRO DA APP NATIVA — quem a renova entrega-a ao outro lado (05/10/2026).
 *
 * O QUE ACONTECEU: na app iOS, o código nativo guarda a sessão e injecta-a nas páginas web
 * embutidas (WKWebView), que correm este mesmo supabase-js. O supabase-js renova o token
 * sozinho a cada hora e RODA o refresh token; o nativo não sabia e continuava com o refresh
 * token antigo — já revogado. Resultado: às 11:52 o token nativo expirou, a renovação nativa
 * passou a dar 400, e o feed ficou a dar 401 em silêncio («postei e não publica»).
 *
 * A REGRA: dentro da app nativa (user agent «MTMNativeApp»), 1) o supabase-js NÃO renova por
 * timer — é o nativo que renova e re-injecta; 2) se mesmo assim o supabase-js renovar (a
 * pedido, quando apanha um token expirado), ENTREGA a sessão nova ao nativo pelo handler
 * `mtmSessao`. Fora da app nada disto corre.
 */

export type SessaoMinima = { access_token: string; refresh_token: string }

type PonteNativa = { webkit?: { messageHandlers?: { mtmSessao?: { postMessage: (m: unknown) => void } } } }

/** Só o user agent que a app nativa escreve (capacitor.config.ts `appendUserAgent`). */
export function ehAppNativa(userAgent: string | undefined | null): boolean {
  return /MTMNativeApp/i.test(userAgent ?? "")
}

/** Eventos do supabase-js que trazem uma sessão que o nativo ainda não tem. */
export function eventoEntregaSessao(evento: string): boolean {
  return evento === "TOKEN_REFRESHED" || evento === "SIGNED_IN"
}

/**
 * Entrega a sessão ao nativo. Devolve true se havia ponte e se enviou. Sem ponte (não é a
 * app, ou é uma versão antiga sem o handler) não faz nada — e não rebenta.
 */
export function entregarSessaoAoNativo(janela: PonteNativa | undefined, sessao: SessaoMinima | null | undefined): boolean {
  const ponte = janela?.webkit?.messageHandlers?.mtmSessao
  if (!ponte || !sessao?.access_token || !sessao?.refresh_token) return false
  try {
    ponte.postMessage({ access_token: sessao.access_token, refresh_token: sessao.refresh_token })
    return true
  } catch {
    return false
  }
}
