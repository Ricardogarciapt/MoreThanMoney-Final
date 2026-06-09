import { NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"

const createTransporter = () =>
  nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER || "morethanmoneypt@gmail.com",
      pass: process.env.GMAIL_APP_PASSWORD || "",
    },
  })

/** Envio transacional simples (admin notifications, alertas manuais). */
export async function POST(request: NextRequest) {
  try {
    const { to, subject, html, text } = await request.json()

    if (!to || !subject || (!html && !text)) {
      return NextResponse.json(
        { success: false, error: "to, subject e html/text são obrigatórios" },
        { status: 400 }
      )
    }

    if (!process.env.GMAIL_APP_PASSWORD) {
      return NextResponse.json(
        { success: false, error: "GMAIL_APP_PASSWORD não configurada" },
        { status: 500 }
      )
    }

    const transporter = createTransporter()
    await transporter.sendMail({
      from: `"MoreThanMoney" <${process.env.GMAIL_USER || "morethanmoneypt@gmail.com"}>`,
      to,
      subject,
      html: html || undefined,
      text: text || undefined,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[EMAIL SEND] Erro:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro ao enviar email",
      },
      { status: 500 }
    )
  }
}
