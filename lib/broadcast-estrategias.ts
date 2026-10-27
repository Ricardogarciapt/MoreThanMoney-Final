import { getSiteUrl } from "@/lib/mail-transport"
import { ESTRATEGIAS_MTM } from "@/lib/estrategias-mtm"
import type { BroadcastEmail } from "@/lib/broadcast-emails"

/**
 * Email «Estratégias MTM» a todos os membros, ativos e inativos, na língua de cada um.
 *
 * Leva a sala do educador MTM, um cartão por estratégia com o guia em PDF e uma pré-visualização
 * dos scanners. Os nomes das estratégias e dos scanners não se traduzem. Não há taxas de acerto:
 * as imagens dos scanners são exemplos educativos, e dizem-no.
 *
 * Os guias só existem em PT e EN: quem lê ES, FR ou DE recebe o guia em inglês.
 */

export type LinguaEmail = "pt" | "en" | "es" | "fr" | "de"

export const SALA_ESTRATEGIAS_URL = "/live/9739ae1a-884d-4d03-8e4a-6da498e51c63"

/** preferred_language, depois detected_language. Sem nenhuma, PT (a casa é portuguesa). */
export function linguaDoMembro(p: { preferred_language?: string | null; detected_language?: string | null }): LinguaEmail {
  const raw = String(p.preferred_language || p.detected_language || "").trim().toLowerCase().slice(0, 2)
  if (!raw) return "pt"
  if (raw === "pt" || raw === "en" || raw === "es" || raw === "fr" || raw === "de") return raw
  return "en"
}

const RESUMO: Record<string, Record<"es" | "fr" | "de", string>> = {
  "golden-zone": {
    es: "Scalping de oro en 5 minutos, con entrada en el retesteo de la zona.",
    fr: "Scalping sur l'or en 5 minutes, avec entrée sur le retest de la zone.",
    de: "Gold-Scalping im 5-Minuten-Chart, Einstieg beim Retest der Zone.",
  },
  momentum: {
    es: "Seguir la dirección por colores, con cinco confirmaciones.",
    fr: "Suivre la direction par couleurs, avec cinq confirmations.",
    de: "Der Richtung nach Farben folgen, mit fünf Bestätigungen.",
  },
  trendshot: {
    es: "Scalping a favor de la tendencia: medias, estrellas y riesgo 1:2.",
    fr: "Scalping dans le sens de la tendance : moyennes, étoiles et risque 1:2.",
    de: "Scalping mit dem Trend: Durchschnitte, Sterne und 1:2-Risiko.",
  },
  supernova: {
    es: "Reversiones impulsivas: estrella, tres velas y ruptura.",
    fr: "Retournements impulsifs : étoile, trois bougies et cassure.",
    de: "Impulsive Umkehrungen: Stern, drei Kerzen und Ausbruch.",
  },
  "sniper-pro": {
    es: "Intradía en 15 minutos, con la tendencia de 4 horas decidiendo.",
    fr: "Intraday en 15 minutes, la tendance 4 heures décide.",
    de: "Intraday im 15-Minuten-Chart, der 4-Stunden-Trend entscheidet.",
  },
  quantum: {
    es: "Tendencia y retrocesos, con el panel de fuerza por timeframe.",
    fr: "Tendance et replis, avec le panneau de force par timeframe.",
    de: "Trend und Rücksetzer, mit dem Stärke-Panel je Timeframe.",
  },
  goldkiller: {
    es: "El oro con objetivos claros: SuperTrend y niveles por percentil.",
    fr: "L'or avec des objectifs clairs : SuperTrend et niveaux par percentile.",
    de: "Gold mit klaren Zielen: SuperTrend und Perzentil-Levels.",
  },
  "aurum-flow": {
    es: "Ruptura del rango de apertura, con el stop en el borde opuesto.",
    fr: "Cassure du range d'ouverture, avec le stop sur le bord opposé.",
    de: "Ausbruch aus der Eröffnungsrange, Stop an der gegenüberliegenden Kante.",
  },
  "mtm-scanner": {
    es: "Medias dobles, POC de volumen y estructura de mercado.",
    fr: "Moyennes doubles, POC de volume et structure de marché.",
    de: "Doppelte Durchschnitte, Volumen-POC und Marktstruktur.",
  },
  sensei: {
    es: "Confluencia de lecturas: solo da señal con confirmaciones suficientes.",
    fr: "Confluence de lectures : il ne signale qu'avec assez de confirmations.",
    de: "Konfluenz von Signalen: es meldet nur mit genug Bestätigungen.",
  },
}

const N = ESTRATEGIAS_MTM.length

const PLATAFORMAS = "Iqonic, Jifu, AkasHX, Evo e IM Mastery Academy"
const PLATAFORMAS_EN = "Iqonic, Jifu, AkasHX, Evo and IM Mastery Academy"

type Texto = {
  assunto: string
  ola: (n: string) => string
  intro: string
  origem: string
  sala: string
  botaoSala: string
  estrategiasTitulo: string
  guia: string
  scannersTitulo: string
  scannersSub: string
  botaoScanners: string
  passos: string
  aviso: string
  assinatura: string
  rodape: string
  cancelar: string
}

const T: Record<LinguaEmail, Texto> = {
  pt: {
    assunto: "📘 Aprende uma estratégia MTM em minutos (guias em PDF + sala)",
    ola: (n) => `Olá, ${n}! 👋`,
    intro: `Juntámos numa só sala as <b>${N} estratégias</b> que estão por trás dos scanners MTM. Cada uma tem 3 vídeos curtos e um <b>guia em PDF</b> com a checklist, para aprenderes uma estratégia em minutos.`,
    origem: `Todas estas estratégias fazem parte de produtos que desenvolvemos antes para outras plataformas, como a ${PLATAFORMAS}. Foi aí que os scanners da MTM deram provas, e é essa experiência que continua em cada scanner que vendemos, hoje e no futuro.`,
    sala: "Tudo está na sala <b>Estratégias MTM</b>:",
    botaoSala: "Abrir a sala Estratégias MTM",
    estrategiasTitulo: `As ${N} estratégias`,
    guia: "Guia em PDF",
    scannersTitulo: "Uma espreitadela aos scanners",
    scannersSub: "É assim que os scanners MTM marcam a entrada, o stop e os alvos no gráfico. Imagens de exemplo, com fim educativo.",
    botaoScanners: "Ver os scanners",
    passos: "O caminho: vê os vídeos, lê o guia, treina em conta demo e só depois usa o scanner ao vivo.",
    aviso: "Conteúdo educativo, não constitui consultoria financeira. O trading tem risco de perda e os resultados não são garantidos.",
    assinatura: "— Ricardo, MoreThanMoney",
    rodape: "Recebes este email por fazeres parte da comunidade MoreThanMoney.",
    cancelar: "Cancelar subscrição",
  },
  en: {
    assunto: "📘 Learn an MTM strategy in minutes (PDF guides + room)",
    ola: (n) => `Hi ${n}! 👋`,
    intro: `We put the <b>${N} strategies</b> behind the MTM scanners into one room. Each one has 3 short videos and a <b>PDF guide</b> with the checklist, so you can learn a strategy in minutes.`,
    origem: `All these strategies are part of products we previously built for other platforms, such as ${PLATAFORMAS_EN}. That is where the MTM scanners proved themselves, and that experience carries on in every scanner we sell, now and in the future.`,
    sala: "Everything is in the <b>MTM Strategies</b> room:",
    botaoSala: "Open the MTM Strategies room",
    estrategiasTitulo: `The ${N} strategies`,
    guia: "PDF guide",
    scannersTitulo: "A quick look at the scanners",
    scannersSub: "This is how the MTM scanners mark the entry, the stop and the targets on the chart. Example images, for educational purposes.",
    botaoScanners: "See the scanners",
    passos: "The path: watch the videos, read the guide, practise on a demo account and only then use the scanner live.",
    aviso: "Educational content, not financial advice. Trading carries a risk of loss and results are not guaranteed.",
    assinatura: "— Ricardo, MoreThanMoney",
    rodape: "You receive this email because you are part of the MoreThanMoney community.",
    cancelar: "Unsubscribe",
  },
  es: {
    assunto: "📘 Aprende una estrategia MTM en minutos (guías en PDF + sala)",
    ola: (n) => `¡Hola, ${n}! 👋`,
    intro: `Reunimos en una sola sala las <b>${N} estrategias</b> que hay detrás de los scanners MTM. Cada una tiene 3 vídeos cortos y una <b>guía en PDF</b> con la checklist, para que aprendas una estrategia en minutos.`,
    origem: `Todas estas estrategias forman parte de productos que desarrollamos antes para otras plataformas, como ${PLATAFORMAS_EN.replace(" and ", " y ")}. Fue allí donde los scanners de MTM demostraron su valor, y esa experiencia sigue en cada scanner que vendemos, hoy y en el futuro.`,
    sala: "Todo está en la sala <b>Estratégias MTM</b>:",
    botaoSala: "Abrir la sala Estratégias MTM",
    estrategiasTitulo: `Las ${N} estrategias`,
    guia: "Guía en PDF (inglés)",
    scannersTitulo: "Un vistazo a los scanners",
    scannersSub: "Así marcan los scanners MTM la entrada, el stop y los objetivos en el gráfico. Imágenes de ejemplo, con fines educativos.",
    botaoScanners: "Ver los scanners",
    passos: "El camino: mira los vídeos, lee la guía, practica en cuenta demo y solo después usa el scanner en real.",
    aviso: "Contenido educativo, no constituye asesoramiento financiero. El trading conlleva riesgo de pérdida y los resultados no están garantizados.",
    assinatura: "— Ricardo, MoreThanMoney",
    rodape: "Recibes este email por formar parte de la comunidad MoreThanMoney.",
    cancelar: "Darse de baja",
  },
  fr: {
    assunto: "📘 Apprends une stratégie MTM en quelques minutes (guides PDF + salle)",
    ola: (n) => `Salut ${n} ! 👋`,
    intro: `Nous avons réuni dans une seule salle les <b>${N} stratégies</b> derrière les scanners MTM. Chacune a 3 courtes vidéos et un <b>guide PDF</b> avec la checklist, pour apprendre une stratégie en quelques minutes.`,
    origem: `Toutes ces stratégies font partie de produits que nous avons développés auparavant pour d'autres plateformes, comme ${PLATAFORMAS_EN.replace(" and ", " et ")}. C'est là que les scanners MTM ont fait leurs preuves, et cette expérience se retrouve dans chaque scanner que nous vendons, aujourd'hui et demain.`,
    sala: "Tout est dans la salle <b>Estratégias MTM</b> :",
    botaoSala: "Ouvrir la salle Estratégias MTM",
    estrategiasTitulo: `Les ${N} stratégies`,
    guia: "Guide PDF (anglais)",
    scannersTitulo: "Un aperçu des scanners",
    scannersSub: "Voici comment les scanners MTM marquent l'entrée, le stop et les objectifs sur le graphique. Images d'exemple, à but éducatif.",
    botaoScanners: "Voir les scanners",
    passos: "Le chemin : regarde les vidéos, lis le guide, entraîne-toi sur un compte démo et seulement ensuite utilise le scanner en réel.",
    aviso: "Contenu éducatif, ne constitue pas un conseil financier. Le trading comporte un risque de perte et les résultats ne sont pas garantis.",
    assinatura: "— Ricardo, MoreThanMoney",
    rodape: "Tu reçois cet email car tu fais partie de la communauté MoreThanMoney.",
    cancelar: "Se désabonner",
  },
  de: {
    assunto: "📘 Lerne eine MTM-Strategie in Minuten (PDF-Guides + Raum)",
    ola: (n) => `Hallo ${n}! 👋`,
    intro: `Wir haben die <b>${N} Strategien</b> hinter den MTM-Scannern in einem Raum gesammelt. Jede hat 3 kurze Videos und einen <b>PDF-Guide</b> mit Checkliste, damit du eine Strategie in Minuten lernst.`,
    origem: `Alle diese Strategien sind Teil von Produkten, die wir zuvor für andere Plattformen entwickelt haben, etwa ${PLATAFORMAS_EN.replace(" and ", " und ")}. Dort haben sich die MTM-Scanner bewährt, und diese Erfahrung steckt in jedem Scanner, den wir verkaufen, heute und in Zukunft.`,
    sala: "Alles findest du im Raum <b>Estratégias MTM</b>:",
    botaoSala: "Raum Estratégias MTM öffnen",
    estrategiasTitulo: `Die ${N} Strategien`,
    guia: "PDF-Guide (Englisch)",
    scannersTitulo: "Ein Blick auf die Scanner",
    scannersSub: "So markieren die MTM-Scanner Einstieg, Stop und Ziele im Chart. Beispielbilder, zu Lernzwecken.",
    botaoScanners: "Scanner ansehen",
    passos: "Der Weg: Videos ansehen, Guide lesen, auf einem Demokonto üben und erst dann den Scanner live nutzen.",
    aviso: "Bildungsinhalt, keine Finanzberatung. Trading birgt Verlustrisiken, Ergebnisse sind nicht garantiert.",
    assinatura: "— Ricardo, MoreThanMoney",
    rodape: "Du erhältst diese E-Mail, weil du Teil der MoreThanMoney-Community bist.",
    cancelar: "Abmelden",
  },
}

const GOLD = "#D2A63C"

export function estrategiasEmail(name: string, lingua: LinguaEmail): BroadcastEmail {
  const site = getSiteUrl()
  const t = T[lingua]
  const capaLingua = lingua === "pt" ? "pt" : "en"
  const guiaLingua = lingua === "pt" ? "pt" : "en"
  const sala = `${site}${SALA_ESTRATEGIAS_URL}`
  const scanners = `${site}/scanner`

  const cartoes = ESTRATEGIAS_MTM.map((e) => {
    const resumo = lingua === "pt" || lingua === "en" ? e.resumo[lingua] : RESUMO[e.slug]?.[lingua] ?? e.resumo.en
    const guia = `${site}${e.guia[guiaLingua]}`
    return `
    <div style="margin:0 0 14px;background:#0f0f16;border:1px solid #26263a;border-radius:12px;overflow:hidden">
      <a href="${sala}"><img src="${site}/educador/estrategias/capas/${e.slug}-${capaLingua}.jpg" alt="${e.nome}" width="516" style="display:block;width:100%;height:auto;border:0"/></a>
      <div style="padding:12px 14px">
        <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:${GOLD}">${e.nome}</p>
        <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#c9c9d6">${resumo}</p>
        <a href="${guia}" style="font-size:13px;font-weight:700;color:${GOLD};text-decoration:none">📄 ${t.guia} →</a>
      </div>
    </div>`
  }).join("")

  const inner = `
    <h1 style="margin:0 0 12px;font-size:20px;color:${GOLD}">${t.ola(name)}</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6">${t.intro}</p>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#d5d5df;border-left:3px solid ${GOLD};padding-left:12px">${t.origem}</p>
    <p style="margin:0 0 10px;font-size:14px;line-height:1.6">${t.sala}</p>
    <a href="${sala}"><img src="${site}/educador/estrategias/capas/sala-${capaLingua}.jpg" alt="Estratégias MTM" width="516" style="display:block;width:100%;height:auto;border:0;border-radius:12px"/></a>
    <div style="text-align:center;margin:18px 0 22px">
      <a href="${sala}" style="display:inline-block;background:${GOLD};color:#0b0b0f;text-decoration:none;font-weight:700;font-size:15px;padding:14px 26px;border-radius:10px">${t.botaoSala}</a>
    </div>
    <h2 style="margin:0 0 12px;font-size:16px;color:${GOLD}">${t.estrategiasTitulo}</h2>
    ${cartoes}
    <div style="height:1px;background:#26263a;margin:18px 0"></div>
    <h2 style="margin:0 0 6px;font-size:16px;color:${GOLD}">${t.scannersTitulo}</h2>
    <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#a9a9b8">${t.scannersSub}</p>
    <a href="${scanners}"><img src="${site}/email/estrategias/preview-trendshot.jpg" alt="TrendShot" width="516" style="display:block;width:100%;height:auto;border:0;border-radius:10px;margin:0 0 10px"/></a>
    <a href="${scanners}"><img src="${site}/email/estrategias/preview-sensei.jpg" alt="Sensei" width="516" style="display:block;width:100%;height:auto;border:0;border-radius:10px"/></a>
    <div style="text-align:center;margin:16px 0 20px">
      <a href="${scanners}" style="display:inline-block;background:transparent;border:1px solid ${GOLD};color:${GOLD};text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px">${t.botaoScanners}</a>
    </div>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.6">${t.passos}</p>
    <p style="margin:0 0 16px;font-size:12px;line-height:1.6;color:#8a8a98">⚠️ ${t.aviso}</p>
    <p style="margin:0;font-size:14px;line-height:1.6">${t.assinatura}</p>`

  const html = `<!doctype html><html lang="${lingua}"><body style="margin:0;background:#0b0b0f;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#e9e9ee">
  <div style="max-width:560px;margin:0 auto;padding:28px 22px">
    <div style="text-align:center;margin-bottom:18px">
      <img src="cid:mtm-logo" alt="MoreThanMoney" width="120" style="max-width:120px;height:auto"/>
    </div>
    <div style="background:#15151d;border:1px solid #26263a;border-radius:16px;padding:26px 22px">${inner}</div>
    <p style="margin:16px 0 0;text-align:center;font-size:11px;line-height:1.6;color:#6a6a78">
      ${t.rodape}<br/>
      <a href="mailto:morethanmoneypt@gmail.com?subject=Cancelar%20emails" style="color:#8a8a9a">${t.cancelar}</a> · <a href="${site}" style="color:#8a8a9a">morethanmoney.pt</a>
    </p>
  </div></body></html>`

  const strip = (s: string) => s.replace(/<[^>]+>/g, "")
  const text = [
    strip(t.ola(name)),
    "",
    strip(t.intro),
    "",
    t.origem,
    "",
    `${strip(t.sala)} ${sala}`,
    "",
    ...ESTRATEGIAS_MTM.map((e) => `• ${e.nome}: ${site}${e.guia[guiaLingua]}`),
    "",
    `${t.scannersTitulo}: ${scanners}`,
    "",
    t.passos,
    "",
    `⚠️ ${t.aviso}`,
    "",
    t.assinatura,
  ].join("\n")

  return { subject: t.assunto, html, text }
}
