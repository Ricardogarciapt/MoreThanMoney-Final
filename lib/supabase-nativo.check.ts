/** npx tsx lib/supabase-nativo.check.ts — prova a entrega da sessão ao nativo e o caso sem ponte. */
import { ehAppNativa, eventoEntregaSessao, entregarSessaoAoNativo } from "./supabase-nativo"
let falhas = 0
const certo = (c: boolean, o: string) => { if (!c) { falhas++; console.error("  ✗ " + o) } }
certo(ehAppNativa("Mozilla/5.0 (iPhone) MTMNativeApp/1.0"), "UA da app é nativa")
certo(!ehAppNativa("Mozilla/5.0 (Macintosh) Safari"), "Safari de secretária não é")
certo(!ehAppNativa(undefined), "sem UA não é")
certo(eventoEntregaSessao("TOKEN_REFRESHED") && eventoEntregaSessao("SIGNED_IN") && !eventoEntregaSessao("SIGNED_OUT"), "só os eventos que trazem sessão")
const recebidos: unknown[] = []
const janela = { webkit: { messageHandlers: { mtmSessao: { postMessage: (m: unknown) => recebidos.push(m) } } } }
certo(entregarSessaoAoNativo(janela, { access_token: "a", refresh_token: "r" }), "com ponte entrega")
certo(JSON.stringify(recebidos[0]) === JSON.stringify({ access_token: "a", refresh_token: "r" }), "entrega só os dois tokens")
certo(!entregarSessaoAoNativo({}, { access_token: "a", refresh_token: "r" }), "sem ponte não rebenta e diz que não entregou")
certo(!entregarSessaoAoNativo(janela, null), "sem sessão não entrega")
certo(!entregarSessaoAoNativo({ webkit: { messageHandlers: { mtmSessao: { postMessage: () => { throw new Error("x") } } } } }, { access_token: "a", refresh_token: "r" }), "ponte a rebentar é engolida")
if (falhas) { console.error(`supabase-nativo: ${falhas} falha(s)`); process.exit(1) }
console.log("supabase-nativo: a sessão renovada na webview volta para o nativo ✓")
