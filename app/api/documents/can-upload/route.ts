import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

const supabase = getSupabaseAdmin()

// GET /api/documents/can-upload?userId=<uuid>
// Indica se o utilizador pode fazer upload de documentos (Admin, VIP ou Educador).
export async function GET(request: NextRequest) {
  try {
    const userId = new URL(request.url).searchParams.get("userId")
    if (!userId) {
      return NextResponse.json({ canUpload: false, role: null })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("user_type, is_active, email")
      .eq("id", userId)
      .single()

    if (!profile?.is_active) {
      return NextResponse.json({ canUpload: false, role: profile?.user_type ?? null })
    }

    if (["admin", "vip"].includes(profile.user_type)) {
      return NextResponse.json({ canUpload: true, role: profile.user_type })
    }

    if (profile.email) {
      const { data: educator } = await supabase
        .from("lms_educators")
        .select("id")
        .eq("email", profile.email)
        .eq("is_active", true)
        .maybeSingle()
      if (educator) {
        return NextResponse.json({ canUpload: true, role: "educator" })
      }
    }

    return NextResponse.json({ canUpload: false, role: profile.user_type })
  } catch (error) {
    console.error("❌ [DOCS] can-upload error:", error)
    return NextResponse.json({ canUpload: false, role: null }, { status: 500 })
  }
}
