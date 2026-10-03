import { getEmailLogoSrc, getSiteUrl } from "@/lib/mail-transport"
import { renderRiskAuditHtml, type RiskAudit } from "@/lib/mtmcopy/risk-audit"

/**
 * Emails de broadcast à comunidade (review da app + desafio mensal).
 * Copy aprovado, COMPLIANT com a Apple: pede reviews HONESTAS (sem prémio ligado
 * à review); o prémio mensal (3 Premium) é só para partilhas/chamadas/redes.
 */

const APP_REVIEW_URL = "https://apps.apple.com/pt/app/mtm-system/id6778558643"

export type BroadcastEmail = { subject: string; html: string; text: string }

function shell(inner: string): string {
  const site = getSiteUrl()
  const logo = getEmailLogoSrc()
  return `<!doctype html><html><body style="margin:0;background:#0b0b0f;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#e9e9ee">
  <div style="max-width:560px;margin:0 auto;padding:28px 22px">
    <div style="text-align:center;margin-bottom:18px">
      <img src="${logo}" alt="MoreThanMoney" width="120" style="max-width:120px;height:auto"/>
    </div>
    <div style="background:#15151d;border:1px solid #26263a;border-radius:16px;padding:26px 22px">
      ${inner}
    </div>
    <p style="margin:16px 0 0;text-align:center;font-size:11px;line-height:1.6;color:#6a6a78">
      Recebes este email por fazeres parte da comunidade MoreThanMoney.<br/>
      Não queres receber mais? <a href="mailto:morethanmoneypt@gmail.com?subject=Cancelar%20emails" style="color:#8a8a9a">Cancelar subscrição</a> · <a href="${site}" style="color:#8a8a9a">morethanmoney.pt</a>
    </p>
  </div></body></html>`
}

const challengeBlock = `
  <h2 style="margin:0 0 10px;font-size:16px;color:#f6c85a">🎁 Desafio do mês</h2>
  <p style="margin:0 0 6px;font-size:14px;line-height:1.6">Todos os meses vou <b>oferecer 3 mensalidades Premium</b> a quem mais:</p>
  <ul style="margin:0 0 14px;padding-left:18px;font-size:14px;line-height:1.7;color:#d5d5df">
    <li>Partilhar os conceitos da MoreThanMoney</li>
    <li>Participar nas chamadas e sessões ao vivo</li>
    <li>Divulgar nas redes sociais</li>
  </ul>`

export function reviewEmail(name: string): BroadcastEmail {
  const inner = `
    <h1 style="margin:0 0 12px;font-size:20px;color:#f6c85a">Bom dia, ${name}! 🙌</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6">Como estão? Peço-vos um favor rápido mas que faz <b>mesmo</b> diferença para a comunidade crescer: façam uma review honesta da nossa app na Apple.</p>
    <div style="text-align:center;margin:22px 0">
      <a href="${APP_REVIEW_URL}" style="display:inline-block;background:#f6c85a;color:#0b0b0f;text-decoration:none;font-weight:700;font-size:15px;padding:14px 26px;border-radius:10px">⭐ Avaliar a app na App Store</a>
    </div>
    <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#a9a9b8">Cliquem no botão, deixem a vossa opinião sincera — cada estrela e cada palavra ajudam muita gente a descobrir a MoreThanMoney.</p>
    <div style="height:1px;background:#26263a;margin:6px 0 18px"></div>
    ${challengeBlock}
    <p style="margin:0;font-size:14px;line-height:1.6">Contamos convosco. Vamos crescer isto juntos 🚀</p>
    <p style="margin:18px 0 0;font-size:14px;line-height:1.6">— Ricardo, MoreThanMoney</p>`
  return {
    subject: "Bom dia malta 🙌 um favor rápido (review da app) + desafio do mês",
    html: shell(inner),
    text: `Bom dia, ${name}!\n\nPeço-vos um favor rápido: façam uma review honesta da nossa app na Apple:\n${APP_REVIEW_URL}\n\nCada review ajuda a comunidade a crescer.\n\nDESAFIO DO MÊS: todos os meses ofereço 3 mensalidades Premium a quem mais partilhar os conceitos da MoreThanMoney, participar nas chamadas e divulgar nas redes.\n\nVamos crescer isto juntos!\n— Ricardo, MoreThanMoney\n\nCancelar: responde a este email com "Cancelar".`,
  }
}

export function monthlyChallengeEmail(name: string): BroadcastEmail {
  const inner = `
    <h1 style="margin:0 0 12px;font-size:20px;color:#f6c85a">Novo mês, novo desafio, ${name}! 🚀</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6">Este mês volto a <b>oferecer 3 mensalidades Premium</b> a quem mais faz crescer a comunidade. Participar é simples:</p>
    ${challengeBlock}
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6">E se ainda não avaliaste a nossa app, deixa a tua opinião honesta — ajuda muita gente a chegar até nós 👇</p>
    <div style="text-align:center;margin:8px 0 4px">
      <a href="${APP_REVIEW_URL}" style="display:inline-block;background:transparent;border:1px solid #f6c85a;color:#f6c85a;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px">⭐ Avaliar a app</a>
    </div>
    <p style="margin:18px 0 0;font-size:14px;line-height:1.6">Bora a isto! — Ricardo, MoreThanMoney</p>`
  return {
    subject: "🎁 Desafio do mês — 3 mensalidades Premium para oferecer",
    html: shell(inner),
    text: `Novo mês, novo desafio, ${name}!\n\nEste mês ofereço 3 mensalidades Premium a quem mais partilhar os conceitos da MoreThanMoney, participar nas chamadas e divulgar nas redes.\n\nE se ainda não avaliaste a app, deixa a tua opinião honesta: ${APP_REVIEW_URL}\n\nBora a isto! — Ricardo, MoreThanMoney`,
  }
}

/**
 * Campanha de conversão do cohort Fundador (grátis-concedido com deadline 31/08).
 * Bilingue PT/EN — a comunidade MTM é internacional. CTA para /upgrade (intro 34,99€).
 */
/**
 * O email de conversão do Fundador.
 *
 * Citava "675 trades · 63% de acerto · +7.060€" — números congelados na auditoria de 30/06 e em
 * euros, que não são comparáveis entre pessoas: o mesmo sinal vale ~8 $ a quem opera 0,01 lote e
 * ~800 $ a quem opera 1. O facto entra de fora, vivo, medido em pips.
 *
 * Sem facto, a caixa da prova não aparece. Um email sem número convence menos; um email com um
 * número velho perde a confiança de quem o verifica, e essa não volta.
 */
export function founderConversionEmail(name: string, facto?: string | null): BroadcastEmail {
  const site = getSiteUrl()
  const url = `${site}/upgrade`
  const inner = `
    <h1 style="margin:0 0 12px;font-size:20px;color:#f6c85a">${name}, o teu acesso Fundador termina a 31 de agosto ⏳</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6">Tens tido acesso <b>Premium</b> à MoreThanMoney sem pagar. Esse período de Fundador <b>termina a 31/08</b> — depois disso o acesso fecha.</p>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6">Podes <b>fixar o teu lugar como Fundador</b> pela melhor condição que alguma vez teremos: <b>1º mês por 34,99€</b> e depois preço Fundador.</p>
    ${facto ? `<div style="background:#0f0f16;border:1px solid #26263a;border-radius:12px;padding:14px 16px;margin:16px 0">
      <p style="margin:0 0 6px;font-size:13px;color:#a9a9b8">O que os sinais fizeram:</p>
      <p style="margin:0;font-size:16px;color:#f6c85a;font-weight:700">${facto}</p>
    </div>` : ''}
    <div style="text-align:center;margin:22px 0">
      <a href="${url}" style="display:inline-block;background:#f6c85a;color:#0b0b0f;text-decoration:none;font-weight:700;font-size:15px;padding:14px 26px;border-radius:10px">Garantir lugar Fundador — 1º mês 34,99€</a>
    </div>
    <p style="margin:0 0 18px;font-size:12px;line-height:1.6;color:#8a8a98">⚠️ Investir e tradar envolve risco de perda. Resultados passados não garantem resultados futuros.</p>
    <div style="height:1px;background:#26263a;margin:6px 0 18px"></div>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#c9c9d6"><b>EN</b> — ${name}, your Founder access ends on Aug 31. Lock in your place at our best-ever deal: <b>1st month for 34,99€</b>, then Founder price.${facto ? ` What the signals did: ${facto}.` : ''}</p>
    <div style="text-align:center;margin:12px 0 2px">
      <a href="${url}" style="display:inline-block;background:transparent;border:1px solid #f6c85a;color:#f6c85a;text-decoration:none;font-weight:700;font-size:13px;padding:10px 20px;border-radius:10px">Keep my Founder access — 34,99€ first month</a>
    </div>
    <p style="margin:18px 0 0;font-size:14px;line-height:1.6">— Ricardo, MoreThanMoney</p>`
  return {
    subject: `${name}, o teu acesso Fundador termina a 31/08 ⏳`,
    html: shell(inner),
    text: `${name}, o teu acesso Fundador à MoreThanMoney termina a 31 de agosto.\n\nFixa o teu lugar pela melhor condição: 1º mês por 34,99€ e depois preço Fundador.${facto ? `\nO que os sinais fizeram: ${facto}.` : ''}\nGarante aqui: ${url}\n\n⚠️ Investir e tradar envolve risco de perda.\n\nEN — Your Founder access ends Aug 31. Lock in the 1st month for 34,99€: ${url}\n\n— Ricardo, MoreThanMoney\n\nCancelar: responde a este email com "Cancelar".`,
  }
}

/**
 * Convite para beta-testar a app Android (teste fechado da Play).
 * Precisamos de 12+ testers durante 14 dias para desbloquear a produção na Play.
 * Link de opt-in (o email do tester tem de estar na lista de testers da faixa Alpha).
 */
export function androidBetaEmail(name: string): BroadcastEmail {
  const site = getSiteUrl()
  const optin = "https://play.google.com/apps/testing/pt.morethanmoney.app"
  const apk = `${site}/downloads/MoreThanMoney.apk`
  const inner = `
    <h1 style="margin:0 0 12px;font-size:20px;color:#f6c85a">${name}, ajuda-nos a lançar a app MTM no Android 📲</h1>
    <p style="margin:0 0 14px;font-size:15px;line-height:1.6">Lançámos a nova <b>app MoreThanMoney para Android</b> — Feed, Chat, sinais <b>Tap-to-Trade</b> e sessões ao vivo, agora <b>nativos</b>.</p>
    <p style="margin:0 0 10px;font-size:15px;line-height:1.6">Se tens <b>Android</b>, precisamos de ti como <b>beta tester</b> (2 min — e ajuda-nos a desbloquear o lançamento público):</p>
    <ol style="margin:0 0 6px;padding-left:18px;font-size:14px;line-height:1.8;color:#d5d5df">
      <li>No telemóvel Android, abre o link abaixo.</li>
      <li>Toca em <b>"Become a tester"</b> e depois instala pela Play Store.</li>
      <li>Mantém a app instalada uns dias. Só isso 🙏</li>
    </ol>
    <div style="text-align:center;margin:22px 0">
      <a href="${optin}" style="display:inline-block;background:#f6c85a;color:#0b0b0f;text-decoration:none;font-weight:700;font-size:15px;padding:14px 26px;border-radius:10px">📲 Tornar-me beta tester (Android)</a>
    </div>
    <p style="margin:0 0 4px;font-size:12px;line-height:1.6;color:#8a8a98">Ou copia o link: <a href="${optin}" style="color:#8a8a9a">${optin}</a></p>
    <p style="margin:0 0 18px;font-size:12px;line-height:1.6;color:#8a8a98">Preferes já, sem Play? APK direto: <a href="${apk}" style="color:#8a8a9a">${apk}</a></p>
    <p style="margin:0;font-size:14px;line-height:1.6">Obrigado — a tua ajuda vale ouro 🚀</p>
    <p style="margin:14px 0 0;font-size:14px;line-height:1.6">— Ricardo, MoreThanMoney</p>`
  return {
    subject: "Ajuda-nos a lançar a app MTM no Android 📲 (2 min)",
    html: shell(inner),
    text: `${name}, ajuda-nos a lançar a app MTM no Android.\n\nSe tens Android, sê beta tester (2 min):\n1) No telemóvel Android abre: ${optin}\n2) Toca "Become a tester" e instala pela Play Store.\n3) Mantém a app instalada uns dias.\n\nOu APK direto: ${apk}\n\nObrigado — Ricardo, MoreThanMoney\n\nCancelar: responde a este email com "Cancelar".`,
  }
}

export function buildBroadcast(template: string, name: string, facto?: string | null): BroadcastEmail {
  if (template === "monthly_challenge") return monthlyChallengeEmail(name)
  if (template === "founder_conversion") return founderConversionEmail(name, facto)
  if (template === "android_beta") return androidBetaEmail(name)
  return reviewEmail(name)
}

/** Shell de relatório (mesmo branding, rodapé de disclaimer em vez de unsubscribe). */
function reportShell(inner: string): string {
  const site = getSiteUrl()
  const logo = getEmailLogoSrc()
  return `<!doctype html><html><body style="margin:0;background:#0b0b0f;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#e9e9ee">
  <div style="max-width:560px;margin:0 auto;padding:28px 22px">
    <div style="text-align:center;margin-bottom:18px">
      <img src="${logo}" alt="MoreThanMoney" width="120" style="max-width:120px;height:auto"/>
    </div>
    <div style="background:#15151d;border:1px solid #26263a;border-radius:16px;padding:26px 22px">
      ${inner}
    </div>
    <p style="margin:16px 0 0;text-align:center;font-size:11px;line-height:1.6;color:#6a6a78">
      Relatório informativo gerado pela MoreThanMoney a pedido. Não constitui aconselhamento financeiro.<br/>
      <a href="${site}" style="color:#8a8a9a">morethanmoney.pt</a>
    </p>
  </div></body></html>`
}

/** Email branded com a auditoria de risco da conta do cliente. */
export function riskAuditEmail(name: string, audit: RiskAudit): BroadcastEmail {
  const first = (name || "").trim().split(/\s+/)[0] || "Olá"
  const intro = `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#d5d5df">Olá ${first}, aqui está a auditoria de risco da tua conta ligada à MoreThanMoney. Revê os pontos abaixo e fala connosco se quiseres ajustar algo.</p>`
  return {
    subject: `A tua auditoria de risco MoreThanMoney — risco ${audit.level}`,
    html: reportShell(intro + renderRiskAuditHtml(audit)),
    text:
      `Olá ${first},\n\nAuditoria de risco da tua conta (nível: ${audit.level}).\n\n` +
      `O que observámos:\n${audit.flags.map((f) => `- ${f}`).join("\n")}\n\n` +
      `Recomendações:\n${audit.recommendations.map((r) => `- ${r}`).join("\n")}\n\n` +
      `Relatório informativo, não é aconselhamento financeiro.\n— MoreThanMoney`,
  }
}
