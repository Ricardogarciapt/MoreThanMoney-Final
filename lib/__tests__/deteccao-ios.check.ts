/**
 * «ESTAMOS DENTRO DA APP iOS?» — UMA PERGUNTA, TRÊS FUNÇÕES, UM SÓ VEREDICTO.
 *
 * Há três sítios a responder à mesma pergunta, e cada um decide coisa diferente a partir dela:
 *
 *   · `lib/app-nativa.ts::ehIosNativo`        — cliente: esconde os links de compra (Apple 3.1.1);
 *   · `lib/is-native-request.ts::isIosAppRequest` — SERVIDOR: recusa o checkout Stripe (3.1.1);
 *   · `lib/ios-sem-cripto.ts::ehAppIos`       — cliente: esconde o cripto (Apple 3.1.5(iii)).
 *
 * ── Porque existe este teste (24/09) ────────────────────────────────────────────────────────
 * Até hoje o do servidor tinha regra própria — `/iphone|ipad|ipod/` — e não conhecia o iPad em
 * modo secretária, que se anuncia como «Macintosh». Os dois do cliente conheciam. Resultado: nesse
 * iPad, dentro da app, o botão de compra estava escondido mas a ROTA deixava passar o checkout
 * Stripe (/api/stripe/create-checkout-session, /api/stripe/create-portal-session,
 * /api/mtmfunded/checkout, /api/access-migration/checkout) e `compraPermitida` vinha `true` em
 * /api/contas e /api/webtrader/contas. Pagamento externo dentro da app é a Guideline 3.1.1 — a
 * família de rejeição que já custou builds.
 *
 * Ninguém viu porque cada função tinha o seu teste e nenhum as comparava. Este compara: qualquer
 * user-agent da tabela tem de receber o MESMO veredicto das três. Se um dia houver razão para
 * divergirem, a razão escreve-se aqui — não se descobre numa rejeição.
 *
 *   npx tsx lib/__tests__/deteccao-ios.check.ts
 */
import assert from 'node:assert/strict'
import { ehIosNativo } from '../app-nativa'
import { isIosAppRequest } from '../is-native-request'
import { ehAppIos } from '../ios-sem-cripto'

/**
 * A tabela. As marcas reais das nossas cascas:
 *  · `MTMNativeApp`      — MTM System (MainActivity.kt põe-lhe `MTMSystemAndroid` atrás no Android);
 *  · `MTMAuto-iOS`       — MTM Auto (Separadores.swift / Webtrader.swift);
 *  · `MTMAuto-Android`   — MTM Auto no Android.
 */
const UAS: { nome: string; ua: string; naAppIos: boolean }[] = [
  {
    nome: 'iPhone, app MTM System',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MTMNativeApp/3.7',
    naAppIos: true,
  },
  {
    // O caso que partiu o gate do Stripe. Um iPad em «Pedir site para computador» deixa de dizer
    // «iPad» e passa a dizer «Macintosh»; a marca da casca é a única coisa que sobra.
    nome: 'iPad em modo secretária, app MTM System («Macintosh»)',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) MTMNativeApp/3.7',
    naAppIos: true,
  },
  {
    nome: 'iPhone, app MTM Auto (separador WebTrader)',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 MTMAuto-iOS/1.2',
    naAppIos: true,
  },
  {
    nome: 'iPad em modo secretária, app MTM Auto',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 MTMAuto-iOS/1.2',
    naAppIos: true,
  },
  // ── o que NÃO é a app iOS ──────────────────────────────────────────────────────────────────
  {
    // A regra é da loja da Apple, não do produto: no Android o cripto e o Stripe ficam.
    nome: 'Android, app MTM Auto',
    ua: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36 MTMAuto-Android/1.0',
    naAppIos: false,
  },
  {
    // Cuidado: este user-agent contém `MTMNativeApp`. Só a exclusão do Android o salva.
    nome: 'Android, shell MTM System',
    ua: 'Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36 MTMNativeApp/1.0 MTMSystemAndroid/1.0',
    naAppIos: false,
  },
  {
    nome: 'Safari num Mac a sério',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    naAppIos: false,
  },
  {
    nome: 'Safari no iPhone (fora da app)',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
    naAppIos: false,
  },
  { nome: 'sem user-agent', ua: '', naAppIos: false },
]

const pedido = (ua: string) => new Request('https://www.morethanmoney.pt/api/stripe/create-checkout-session', { headers: ua ? { 'user-agent': ua } : {} })

let falhas = 0
for (const c of UAS) {
  const vistas: Record<string, boolean> = {
    'app-nativa::ehIosNativo': ehIosNativo(c.ua),
    'is-native-request::isIosAppRequest': isIosAppRequest(pedido(c.ua)),
    'ios-sem-cripto::ehAppIos': ehAppIos(c.ua),
  }
  for (const [onde, v] of Object.entries(vistas)) {
    try {
      assert.equal(v, c.naAppIos, `${c.nome}: ${onde} diz ${v}, esperado ${c.naAppIos}\n  ua: ${c.ua || '(vazio)'}`)
    } catch (e) {
      falhas++
      console.error(`✗ ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}

/**
 * O gate do cripto é outra decisão (3.1.5) mas a mesma pergunta. Está a ser feito com o MESMO
 * user-agent, por isso enquanto as duas decisões viverem em funções separadas têm de concordar
 * sobre ONDE estão — só podem discordar sobre o que esconder.
 */
for (const c of UAS) {
  try {
    assert.equal(ehAppIos(c.ua), ehIosNativo(c.ua), `${c.nome}: o gate do cripto e o do IAP discordam sobre estarmos na app iOS`)
  } catch (e) {
    falhas++
    console.error(`✗ ${e instanceof Error ? e.message : String(e)}`)
  }
}

if (falhas) {
  console.error(`\ndetecção iOS: ${falhas} falha(s)`)
  process.exit(1)
}
console.log(`  ok  detecção iOS: ${UAS.length} user-agents, as três funções com o mesmo veredicto (iPad «Macintosh» incluído)`)
