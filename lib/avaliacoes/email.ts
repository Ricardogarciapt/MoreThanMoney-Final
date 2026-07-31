import {
  brandedMailAttachments,
  createMailTransporter,
  getEmailLogoSrc,
  getSiteUrl,
  mailFrom,
  prepareBrandedEmailHtml,
} from "@/lib/mail-transport"

type CertEmailInput = {
  to: string
  name: string
  assessmentTitle: string
  pdfBuffer: Buffer
  code: string
  gradeText?: string | null // ex.: "17,2 valores"
}

// Envia o certificado (PDF em anexo) para o email do aluno.
export async function sendCertificateEmail(input: CertEmailInput): Promise<{ success: boolean; error?: unknown }> {
  const site = getSiteUrl()
  const logo = getEmailLogoSrc()
  const gradeLine = input.gradeText
    ? `<p style="margin:8px 0 0;font-size:15px;color:#333;">Classificação final: <strong style="color:#BB8525;">${input.gradeText}</strong></p>`
    : ""

  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8f9fa;padding:20px;">
    <div style="text-align:center;background:linear-gradient(135deg,#D2A63C,#BB8525);padding:24px;border-radius:12px 12px 0 0;">
      <img src="${logo}" alt="MoreThanMoney" width="140" />
    </div>
    <div style="background:#ffffff;padding:28px;border-radius:0 0 12px 12px;">
      <h2 style="color:#BB8525;margin:0 0 12px;">Parabéns, ${input.name}! 🎓</h2>
      <p style="font-size:15px;color:#333;line-height:1.6;margin:0;">
        Concluíste com aproveitamento a avaliação <strong>${input.assessmentTitle}</strong>.
        O teu certificado oficial da MoreThanMoney segue em anexo (PDF).
      </p>
      ${gradeLine}
      <div style="margin:20px 0;padding:14px 16px;background:#faf6ec;border:1px solid #eadcb8;border-radius:10px;">
        <p style="margin:0;font-size:13px;color:#666;">Código de validação</p>
        <p style="margin:4px 0 0;font-size:16px;font-weight:700;letter-spacing:1px;color:#BB8525;">${input.code}</p>
      </div>
      <p style="font-size:14px;color:#333;line-height:1.6;">
        Podes ver todas as tuas avaliações e voltar a descarregar os teus certificados em
        <a href="${site}/avaliacoes" style="color:#BB8525;font-weight:600;">${site.replace(/^https?:\/\//, "")}/avaliacoes</a>.
      </p>
      <p style="font-size:13px;color:#999;margin-top:24px;">Continua a tua evolução. — Equipa MoreThanMoney</p>
    </div>
  </div>`

  try {
    const transporter = createMailTransporter()
    await transporter.sendMail({
      from: mailFrom(),
      to: input.to,
      subject: `🎓 O teu certificado — ${input.assessmentTitle}`,
      html: prepareBrandedEmailHtml(html),
      attachments: [
        ...brandedMailAttachments(),
        { filename: `certificado-${input.code}.pdf`, content: input.pdfBuffer },
      ],
    })
    return { success: true }
  } catch (error) {
    console.error("[avaliacoes] erro ao enviar certificado:", error)
    return { success: false, error }
  }
}
