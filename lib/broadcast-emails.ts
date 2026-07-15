import { getEmailLogoSrc, getSiteUrl } from "@/lib/mail-transport"

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

export function buildBroadcast(template: string, name: string): BroadcastEmail {
  if (template === "monthly_challenge") return monthlyChallengeEmail(name)
  return reviewEmail(name)
}
