/**
 * OS ESTUDOS PUBLICADOS DOS SCANNERS MTM — fonte única para o scanner da app e o WebTrader.
 *
 * Cada scanner é um (ou vários) scripts Pine publicados no TradingView, que o widget gratuito
 * carrega por `studies: ["PUB;<id>"]`. Esta tabela vivia dentro de components/mobile/scanner-mobile.tsx;
 * saiu para aqui quando o WebTrader do MTM Funded passou a oferecer GoldKiller, Sensei e MTM
 * Scanner no gráfico de análise — duas cópias da mesma lista acabam sempre por divergir num id.
 *
 * Módulo PURO (sem imports): serve cliente e servidor.
 */

// Ordem explícita dos scanners (mantém a ordem dos botões)
export const scannerOrder = [
  "GoldenZone",
  "Momentum",
  "AurumFlow",
  "TrendShot",
  "Supernova",
  "Winzone",
  "Sinergy",
  "Goldkiller",
  "MTMScanner",
  "Sensei",
] as const

export type ScannerKey = (typeof scannerOrder)[number]

// Scanners MTM
export const scannerStudies: Record<ScannerKey, string[]> = {
  GoldenZone: ["PUB;0b373fb0e6634a73bc8b838cf0690725"],
  Momentum: ["PUB;00ec48baf0ee43f0a43e1658bb54cdab", "PUB;38080827cf244587b5e7dbb9f272db0a"],
  // v2 (29/09/2026): só o motor de rompimento. O de reversão media −0,200R por trade com um
  // intervalo que não tocava o zero — era o único resultado significativo do estudo, e era
  // negativo. Ver docs/aurum-orb-vs-smc.md. O id anterior era 4ca56ac1…
  AurumFlow: ["PUB;7a37672ce0bf426eb038be265b6b4aba"],
  TrendShot:["PUB;be1c60d3c15249e4b609bb40a4412d1f"],
  Supernova: ["PUB;c16bafd7d0874182a1415648ec3ed7b8"],
  Winzone: [
    "PUB;6c003d30b2154ef3a31074d5c703954f",
    "PUB;e6adb5e5246c43f4a8dcffde5c98db4e",
    "PUB;162198dcae874d5da28f7b048feb76e7",
    "PUB;b6587ba7dc7b4489927cfd94d1fb8a9f",
    "PUB;0bf15eb0edba447f84e19fce69391ccb",
  ],
  Sinergy: ["PUB;3b86bd1192124fd98583490bb7508041"],
  Goldkiller: ["PUB;a3eaa6af54de4202a2c2f807fd8baa08"],
  MTMScanner: ["PUB;134fd950920e435694c40be33e3aa98f"],
  Sensei: ["PUB;0aba45d8eeed42368922a344f547eeb6"],
}

export const scannerLabels: Record<ScannerKey, string> = {
  GoldenZone: "Golden Zone",
  Momentum: "Momentum",
  AurumFlow: "MTM Aurum Flow Cripto",
  TrendShot: "TrendShot",
  Supernova: "Supernova",
  Winzone: "Sniper Pro",
  Sinergy: "Quantum",
  Goldkiller: "GoldKiller",
  MTMScanner: "MTM",
  Sensei: "Sensei",
}

/**
 * Os três estudos que o WebTrader oferece. Para cada um:
 *  · `alerta` — a chave canónica dos alertas (lib/mtm-alerts/scanners → scannerKeyFromStrategy),
 *    para sobrepor no gráfico de negociação os SINAIS que o estudo gerou;
 *  · `acesso` — o nome que lib/mtmfunded/acesso.ts usa (o participante de torneio só tem GoldKiller);
 *  · `curto` — o texto das setas no gráfico.
 */
export const ESTUDOS_WEBTRADER = [
  { chave: "Goldkiller", rotulo: "GoldKiller", alerta: "goldkiller", acesso: "GoldKiller", curto: "GK", cor: "#EAB308" },
  { chave: "Sensei", rotulo: "Sensei", alerta: "sensei", acesso: "Sensei", curto: "Sensei", cor: "#F472B6" },
  { chave: "MTMScanner", rotulo: "MTM Scanner", alerta: "mtmscanner", acesso: "MTMScanner", curto: "MTM", cor: "#A78BFA" },
] as const

export type EstudoWebtrader = (typeof ESTUDOS_WEBTRADER)[number]
export type ChaveEstudoWebtrader = EstudoWebtrader["chave"]
