import QRCode from 'qrcode'
import {
  brandedMailAttachments,
  createMailTransporter,
  getEmailLogoSrc,
  getSiteUrl,
  mailFrom,
  prepareBrandedEmailHtml,
} from '@/lib/mail-transport'
import type { MotivoLink } from './credenciais-link'
import { textosDaEntrega, type ContaEntrega, type Idioma } from './email-tipo-conta'

/**
 * Entrega da conta de torneio / desafio / Funded ao participante (contas da CORRETORA, motor mt5 —
 * as simuladas usam ./email-credenciais.ts). Assunto, texto, tipo e tamanho saem de
 * ./email-tipo-conta.ts, lidos da conta real (./entrega-conta-dados.ts), em PT ou EN.
 *
 * O QR é o VERDADEIRO — o que a própria plataforma desenha no diálogo final e que a app lê
 * em «Nova conta → Entrar com código QR». O agente recorta-o do ecrã e envia-o com as
 * credenciais.
 *
 * Aqui esteve, durante um tempo, um código apontado a `mt5://account?login=…&server=…`. Esse
 * esquema não existe: nenhuma app de MT5 o regista, e a leitura não fazia nada. Ia em todos
 * os emails a prometer uma coisa que nunca acontecia.
 *
 * Não havendo QR da plataforma, vai um que abre a área do participante. Menos bom, mas
 * verdadeiro — um código que não faz nada é pior do que código nenhum.
 *
 * A PASSWORD NÃO VAI NO CORPO DO EMAIL, e isso é deliberado. Um email fica na caixa de
 * entrada para sempre, é reencaminhado sem se pensar, e é lido por quem tiver acesso ao
 * telemóvel de alguém. Vai um link para o painel, onde a password se vê depois de entrar
 * na conta MTM — a mesma sessão que já protege tudo o resto.
 */

export interface EmailContaInput {
  para: string
  nome: string
  /** A conta, lida da base (./entrega-conta-dados.ts). Decide assunto, texto e tamanho. */
  conta: ContaEntrega
  idioma?: Idioma
  /** 'criacao' (entrega) por defeito; 'reenvio' no reenvio do admin. */
  motivo?: MotivoLink
  login: string
  servidor: string
  alavancagem: number
  /** Para onde o participante vai ver a password e as métricas. */
  urlPainel: string
  /**
   * O QR do MetaTrader, em data URI, recortado do diálogo final pela própria plataforma.
   * É este que entra com um toque em «Nova conta → Entrar com código QR». Não havendo, o
   * email cai para um QR que abre a área do participante — que é útil, mas não é a mesma
   * coisa.
   */
  qrMetaTrader?: string | null
  regras?: Record<string, number | string> | null
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

/** Puro (sem QR nem transporte): assunto e HTML — para pré-visualizar e testar. */
export function montarEmailDaConta(input: EmailContaInput, opts: { site: string; logo: string; temQr: boolean; qrDoMetaTrader: boolean }): { assunto: string; html: string } {
  const idioma: Idioma = input.idioma ?? 'pt'
  const pt = idioma === 'pt'
  const t = textosDaEntrega(input.conta, input.motivo ?? 'criacao', idioma)
  const { site, logo, temQr, qrDoMetaTrader } = opts

  const r = input.regras ?? {}
  const linhasRegras = [
    r.objetivo_pct != null ? (pt ? `Objectivo de lucro: <strong>${r.objetivo_pct}%</strong>${r.objetivo_fase2_pct != null ? ` na fase 1 e <strong>${r.objetivo_fase2_pct}%</strong> na fase 2` : ''}` : `Profit target: <strong>${r.objetivo_pct}%</strong>${r.objetivo_fase2_pct != null ? ` in phase 1 and <strong>${r.objetivo_fase2_pct}%</strong> in phase 2` : ''}`) : null,
    r.perda_diaria_pct != null ? (pt ? `Perda diária máxima: <strong>${r.perda_diaria_pct}%</strong>` : `Maximum daily loss: <strong>${r.perda_diaria_pct}%</strong>`) : null,
    r.perda_maxima_pct != null ? (pt ? `Perda máxima total: <strong>${r.perda_maxima_pct}%</strong>` : `Maximum overall loss: <strong>${r.perda_maxima_pct}%</strong>`) : null,
    r.dias_minimos != null ? (pt ? `Dias mínimos de negociação: <strong>${r.dias_minimos}</strong>` : `Minimum trading days: <strong>${r.dias_minimos}</strong>`) : null,
    r.consistencia_pct != null ? (pt ? `Nenhum dia acima de <strong>${r.consistencia_pct}%</strong> do lucro` : `No single day above <strong>${r.consistencia_pct}%</strong> of the profit`) : null,
  ].filter(Boolean)

  const linha = (rotulo: string, valor: string, primeira = false) =>
    `<tr><td style="padding:8px 0;color:#666;${primeira ? '' : 'border-top:1px solid #eee;'}">${esc(rotulo)}</td>
            <td style="padding:8px 0;text-align:right;font-weight:700;color:#111;${primeira ? '' : 'border-top:1px solid #eee;'}">${esc(valor)}</td></tr>`

  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8f9fa;padding:20px;">
    <div style="text-align:center;background:linear-gradient(135deg,#D2A63C,#BB8525);padding:24px;border-radius:12px 12px 0 0;">
      <img src="${logo}" alt="MoreThanMoney" width="140" />
    </div>
    <div style="background:#ffffff;padding:28px;border-radius:0 0 12px 12px;">
      <h2 style="color:#BB8525;margin:0 0 4px;">${esc(t.cabecalho)}</h2>
      <p style="margin:0 0 12px;font-size:13px;color:#8a6a1f;font-weight:600;">${esc(t.subtitulo)}</p>
      <p style="font-size:15px;color:#333;line-height:1.6;margin:0 0 8px;">${esc(t.rotulos.ola(input.nome))}</p>
      <p style="font-size:15px;color:#333;line-height:1.6;margin:0;">
        ${esc(t.frase)}
        ${pt ? 'Aqui ficam os dados de acesso à conta MetaTrader 5.' : 'Here are the access details for your MetaTrader 5 account.'}
      </p>

      <table style="width:100%;margin:20px 0;border-collapse:collapse;font-size:14px;">
        ${linha('Login', input.login, true)}
        ${linha(t.rotulos.servidor, input.servidor)}
        ${/* Tipo, tamanho (da conta — sem ele a linha não aparece; antes saía «0 USD»), programa/torneio. */ ''}
        ${t.linhas.map(([k, v]) => linha(k, v)).join('')}
        ${linha(pt ? 'Alavancagem' : 'Leverage', `1:${input.alavancagem}`)}
      </table>

      ${
        t.real
          ? `
      <div style="margin:20px 0;padding:18px 20px;background:#f4f8f5;border:1px solid #cfe3d6;border-radius:12px;">
        <p style="margin:0;font-size:16px;line-height:1.6;color:#1f3d2e;">
          <strong>${pt ? 'Esta conta já não é uma prova.' : 'This account is no longer a test.'}</strong>
        </p>
        <p style="margin:10px 0 0;font-size:14px;line-height:1.65;color:#41604f;">
          ${pt
            ? 'É a tua conta Funded, aberta com a assinatura do contrato. Não há objectivo a atingir nem fase a passar: o que fizeres aqui conta para os teus pagamentos — <strong>75% dos resultados são teus</strong>.'
            : 'It is your Funded account, opened when you signed the contract. There is no target to hit and no phase to pass: what you do here counts towards your payouts — <strong>75% of the results are yours</strong>.'}
        </p>
        <p style="margin:10px 0 0;font-size:13px;line-height:1.65;color:#6b8577;">
          ${pt
            ? 'A conta Funded é <strong>negociação de capital patrocinado MTM</strong>: o Fundo MTM patrocina a conta com capital real correspondente a 10% do valor nominal. Os levantamentos são pagos como depósito na tua conta da PU Prime, acima da almofada de 3% — pedes na tua área.'
            : 'The Funded account is <strong>trading of MTM-sponsored capital</strong>: the MTM Fund sponsors the account with real capital equal to 10% of its nominal value. Withdrawals are paid as a deposit into your PU Prime account, above the 3% cushion — you request them in your area.'}
        </p>
      </div>`
          : ''
      }

      ${temQr ? `
      <div style="text-align:center;margin:22px 0;">
        <img src="cid:mtm-conta-qr" alt="${qrDoMetaTrader ? (pt ? 'Entrar na conta com o MetaTrader 5' : 'Sign in with MetaTrader 5') : (pt ? 'Abrir a minha área' : 'Open my area')}" width="180" style="border-radius:12px;background:#fff;padding:8px;" />
        <p style="margin:8px 0 0;font-size:12px;color:#888;">${
          qrDoMetaTrader
            ? (pt ? 'No MetaTrader 5 do telemóvel: <strong>Nova conta → Entrar com código QR</strong>' : 'In MetaTrader 5 on your phone: <strong>New account → Sign in with QR code</strong>')
            : (pt ? 'Aponta a câmara do telemóvel para abrires a tua área' : 'Point your phone camera here to open your area')
        }</p>
      </div>` : ''}

      <div style="margin:20px 0;padding:14px 16px;background:#faf6ec;border:1px solid #eadcb8;border-radius:10px;">
        <p style="margin:0;font-size:13px;color:#666;">${pt ? 'A palavra-passe não vai por email' : 'The password is not sent by email'}</p>
        <p style="margin:6px 0 0;font-size:14px;color:#333;line-height:1.5;">
          ${pt
            ? 'Um email fica na caixa de entrada para sempre. A tua palavra-passe está no painel, protegida pela tua conta MTM.'
            : 'An email stays in your inbox forever. Your password is in your dashboard, protected by your MTM account.'}
        </p>
        <a href="${input.urlPainel}" style="display:inline-block;margin-top:12px;background:#BB8525;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;">
          ${pt ? 'Ver a palavra-passe' : 'View the password'}
        </a>
      </div>

      ${linhasRegras.length ? `
      <div style="margin:20px 0;">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#111;">${pt ? 'As regras, sem letras pequenas' : 'The rules, no fine print'}</p>
        <ul style="margin:0;padding-left:18px;font-size:14px;color:#444;line-height:1.7;">
          ${linhasRegras.map((l) => `<li>${l}</li>`).join('')}
        </ul>
        <p style="margin:10px 0 0;font-size:12px;color:#888;line-height:1.5;">
          ${pt
            ? `Tudo medido sobre equity — as posições abertas contam. Quebrar uma regra congela a conta na posição em que estava${t.real ? ' e encerra a relação de trader financiado' : '; não há segunda conta'}.`
            : `Everything is measured on equity — open positions count. Breaking a rule freezes the account where it stood${t.real ? ' and ends the funded-trader relationship' : '; there is no second account'}.`}
        </p>
      </div>` : ''}

      <p style="margin:18px 0 0;font-size:12px;color:#888;line-height:1.5;">${esc(t.aviso)}</p>
      <p style="font-size:13px;color:#999;margin-top:18px;">
        ${pt ? 'Boas trades. — Equipa MoreThanMoney' : 'Good trading. — The MoreThanMoney team'}<br />
        <a href="${site}" style="color:#BB8525;">${site.replace(/^https?:\/\//, '')}</a>
      </p>
    </div>
  </div>`

  return { assunto: t.assunto, html }
}

export async function enviarEmailDaConta(
  input: EmailContaInput,
): Promise<{ success: boolean; error?: unknown }> {
  const site = getSiteUrl()
  const logo = getEmailLogoSrc()

  // O da plataforma primeiro; o da área do participante como recurso.
  const doMetaTrader = (input.qrMetaTrader ?? '').startsWith('data:image/png;base64,')
  let qrBuffer: Buffer | null = null
  try {
    qrBuffer = doMetaTrader
      ? Buffer.from((input.qrMetaTrader as string).split(',')[1], 'base64')
      : await QRCode.toBuffer(input.urlPainel, { width: 320, margin: 1 })
  } catch {
    // Sem QR o email continua a servir: os dados estão lá em texto. Falhar o envio por
    // causa de uma imagem seria trocar o essencial pelo acessório.
    qrBuffer = null
  }

  const { assunto, html } = montarEmailDaConta(input, { site, logo, temQr: Boolean(qrBuffer), qrDoMetaTrader: doMetaTrader })

  try {
    const transporter = createMailTransporter()
    await transporter.sendMail({
      from: mailFrom(),
      to: input.para,
      subject: assunto,
      html: prepareBrandedEmailHtml(html),
      attachments: [
        ...brandedMailAttachments(),
        ...(qrBuffer ? [{ filename: 'conta-mt5.png', content: qrBuffer, cid: 'mtm-conta-qr' }] : []),
      ],
    })
    return { success: true }
  } catch (error) {
    console.error('[mtmfunded] erro ao enviar a conta:', error)
    return { success: false, error }
  }
}
