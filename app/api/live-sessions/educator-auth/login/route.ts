import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { getSupabaseAdmin } from "@/lib/admin-api-helpers"
import { getEducatorCookieName, signEducatorToken } from "@/lib/lms-educator-auth"

const supabase = getSupabaseAdmin()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = String(body.email || "").trim().toLowerCase()
    const password = String(body.password || "")

    if (!email || !password) {
      return NextResponse.json({ error: "Email e password são obrigatórios" }, { status: 400 })
    }

    const { data: educator, error } = await supabase
      .from("lms_educators")
      .select("id, email, display_name, password_hash, is_active")
      .eq("email", email)
      .maybeSingle()

    if (error || !educator) {
      return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 })
    }
    if (!educator.is_active) {
      return NextResponse.json({ error: "Educador inativo" }, { status: 403 })
    }

    const isValid = await bcrypt.compare(password, educator.password_hash)
    if (!isValid) {
      return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 })
    }

    const token = signEducatorToken({
      educatorId: educator.id,
      email: educator.email,
      displayName: educator.display_name,
    })

    const response = NextResponse.json({
      success: true,
      educator: {
        id: educator.id,
        email: educator.email,
        display_name: educator.display_name,
      },
    })

    response.cookies.set(getEducatorCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 12,
      path: "/",
    })

    return response
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro interno" }, { status: 500 })
  }
}

