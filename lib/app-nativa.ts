/**
 * DENTRO DE QUE APP ESTAMOS? — a detecção pelo user-agent das webviews das nossas apps, num sítio só.
 *
 * Antes havia quatro cópias no WebTrader, todas diferentes (entrar-webtrader, ligador-contas,
 * funded-copier, instalar-webtrader): umas esqueciam a app MTM Auto (`MTMAuto-iOS`), outras o iPad
 * em modo secretária (anuncia-se «Macintosh»). No ligador isso deixava aparecer links de compra
 * Stripe dentro da app iOS (Apple 3.1.1). A regra canónica é a mais completa das quatro.
 *
 * Marcas no user-agent:
 *  · `MTMNativeApp`      — MTM System (iOS, WKWebView); no iPad pode vir com «Macintosh»;
 *  · `MTMAuto-iOS`       — app MTM Auto (iOS), separador WebTrader;
 *  · `MTMAuto-Android`   — app MTM Auto (Android);
 *  · `MTMSystemAndroid`  — shell Android do MTM System.
 *
 * Puro (recebe o user-agent; sem ele lê o do browser): testado em lib/__tests__/app-nativa.check.ts.
 * `lib/ios-sem-cripto.ts::ehAppIos` fica com a regra dele (só MTM System) — é outra decisão (cripto).
 */

const uaDoBrowser = () => (typeof navigator !== "undefined" ? navigator.userAgent : "")

/** App iOS nossa (MTM System ou MTM Auto): sem compras fora da App Store (Apple 3.1.1). */
export function ehIosNativo(ua?: string | null): boolean {
  const u = ua ?? uaDoBrowser()
  if (!u || /Android/i.test(u)) return false
  // O iPad dentro de uma app identifica-se como «Macintosh»; nenhum browser de Mac traz estas marcas.
  return /MTMAuto-iOS/i.test(u) || (/MTMNativeApp/i.test(u) && /iPhone|iPad|iPod|Macintosh/i.test(u))
}

/** Qualquer app nossa (iOS ou Android), pelo user-agent. */
export function ehAppNativaPorUA(ua?: string | null): boolean {
  const u = ua ?? uaDoBrowser()
  return /MTMNativeApp|MTMAuto-(iOS|Android)|MTMSystemAndroid/i.test(u)
}
