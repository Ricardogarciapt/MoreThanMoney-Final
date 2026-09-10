import QRCode from 'qrcode'
import {
  brandedMailAttachments,
  createMailTransporter,
  getEmailLogoSrc,
  getSiteUrl,
  mailFrom,
  prepareBrandedEmailHtml,
} from '@/lib/mail-transport'

/**
 * Entrega da conta de torneio / desafio ao participante.
 *
 * O QR abre o MetaTrader já com o servidor e o login preenchidos — é a diferença entre
 * "toma aqui uns números" e "entra". O formato `mt5://` é o que as apps de MT5 reconhecem.
 *
 * A PASSWORD NÃO VAI NO CORPO DO EMAIL, e isso é deliberado. Um email fica na caixa de
 * entrada para sempre, é reencaminhado sem se pensar, e é lido por quem tiver acesso ao
 * telemóvel de alguém. Vai um link para o painel, onde a password se vê depois de entrar
 * na conta MTM — a mesma sessão que já protege tudo o resto.
 */

export interface EmailContaInput {
  para: string
  nome: string
  /** "Torneio" ou "Desafio" — muda o texto, não a mecânica. */
  tipo: 'torneio' | 'desafio'
  nomeProva: string
  login: string
  servidor: string
  saldo: number
  alavancagem: number
  /** Para onde o participante vai ver a password e as métricas. */
  urlPainel: string
  regras?: Record<string, number | string> | null
}

export async function enviarEmailDaConta(
  input: EmailContaInput,
): Promise<{ success: boolean; error?: unknown }> {
  const site = getSiteUrl()
  const logo = getEmailLogoSrc()

  // `mt5://` com servidor e login: abre a app já a meio caminho.
  const alvoQr = `mt5://account?login=${encodeURIComponent(input.login)}&server=${encodeURIComponent(input.servidor)}`
  let qrBuffer: Buffer | null = null
  try {
    qrBuffer = await QRCode.toBuffer(alvoQr, { width: 320, margin: 1 })
  } catch {
    // Sem QR o email continua a servir: os dados estão lá em texto. Falhar o envio por
    // causa de uma imagem seria trocar o essencial pelo acessório.
    qrBuffer = null
  }

  const r = input.regras ?? {}
  const linhasRegras = [
    r.perda_diaria_pct != null ? `Perda diária máxima: <strong>${r.perda_diaria_pct}%</strong>` : null,
    r.perda_maxima_pct != null ? `Perda máxima total: <strong>${r.perda_maxima_pct}%</strong>` : null,
    r.dias_minimos != null ? `Dias mínimos de negociação: <strong>${r.dias_minimos}</strong>` : null,
    r.consistencia_pct != null ? `Nenhum dia acima de <strong>${r.consistencia_pct}%</strong> do lucro` : null,
  ].filter(Boolean)

  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8f9fa;padding:20px;">
    <div style="text-align:center;background:linear-gradient(135deg,#D2A63C,#BB8525);padding:24px;border-radius:12px 12px 0 0;">
      <img src="${logo}" alt="MoreThanMoney" width="140" />
    </div>
    <div style="background:#ffffff;padding:28px;border-radius:0 0 12px 12px;">
      <h2 style="color:#BB8525;margin:0 0 12px;">A tua conta está pronta, ${input.nome}</h2>
      <p style="font-size:15px;color:#333;line-height:1.6;margin:0;">
        ${input.tipo === 'torneio'
          ? `Estás inscrito no <strong>${input.nomeProva}</strong>.`
          : `O teu desafio <strong>${input.nomeProva}</strong> está activo.`}
        Aqui ficam os dados de acesso à conta MetaTrader 5.
      </p>

      <table style="width:100%;margin:20px 0;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:8px 0;color:#666;">Login</td>
            <td style="padding:8px 0;text-align:right;font-weight:700;color:#111;">${input.login}</td></tr>
        <tr><td style="padding:8px 0;color:#666;border-top:1px solid #eee;">Servidor</td>
            <td style="padding:8px 0;text-align:right;font-weight:700;color:#111;border-top:1px solid #eee;">${input.servidor}</td></tr>
        <tr><td style="padding:8px 0;color:#666;border-top:1px solid #eee;">Saldo</td>
            <td style="padding:8px 0;text-align:right;font-weight:700;color:#111;border-top:1px solid #eee;">${Number(input.saldo).toLocaleString('pt-PT')} USD</td></tr>
        <tr><td style="padding:8px 0;color:#666;border-top:1px solid #eee;">Alavancagem</td>
            <td style="padding:8px 0;text-align:right;font-weight:700;color:#111;border-top:1px solid #eee;">1:${input.alavancagem}</td></tr>
      </table>

      ${qrBuffer ? `
      <div style="text-align:center;margin:22px 0;">
        <img src="cid:mtm-conta-qr" alt="Ligar no MetaTrader" width="180" style="border-radius:12px;" />
        <p style="margin:8px 0 0;font-size:12px;color:#888;">Lê o código com o MetaTrader 5 no telemóvel</p>
      </div>` : ''}

      <div style="margin:20px 0;padding:14px 16px;background:#faf6ec;border:1px solid #eadcb8;border-radius:10px;">
        <p style="margin:0;font-size:13px;color:#666;">A palavra-passe não vai por email</p>
        <p style="margin:6px 0 0;font-size:14px;color:#333;line-height:1.5;">
          Um email fica na caixa de entrada para sempre. A tua palavra-passe está no painel,
          protegida pela tua conta MTM.
        </p>
        <a href="${input.urlPainel}" style="display:inline-block;margin-top:12px;background:#BB8525;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;">
          Ver a palavra-passe
        </a>
      </div>

      ${linhasRegras.length ? `
      <div style="margin:20px 0;">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#111;">As regras, sem letras pequenas</p>
        <ul style="margin:0;padding-left:18px;font-size:14px;color:#444;line-height:1.7;">
          ${linhasRegras.map((l) => `<li>${l}</li>`).join('')}
        </ul>
        <p style="margin:10px 0 0;font-size:12px;color:#888;line-height:1.5;">
          Tudo medido sobre equity — as posições abertas contam. Quebrar uma regra congela a
          conta na posição em que estava; não há segunda conta.
        </p>
      </div>` : ''}

      <p style="font-size:13px;color:#999;margin-top:24px;">
        Boas trades. — Equipa MoreThanMoney<br />
        <a href="${site}" style="color:#BB8525;">${site.replace(/^https?:\/\//, '')}</a>
      </p>
    </div>
  </div>`

  try {
    const transporter = createMailTransporter()
    await transporter.sendMail({
      from: mailFrom(),
      to: input.para,
      subject:
        input.tipo === 'torneio'
          ? `A tua conta de torneio — ${input.nomeProva}`
          : `A tua conta de desafio — ${input.nomeProva}`,
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
