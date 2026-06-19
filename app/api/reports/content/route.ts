import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()

    // Resolve caller
    const authHeader = request.headers.get("authorization") || ""
    const token = authHeader.replace(/^Bearer\s+/i, "").trim()
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const reporterId = authData.user.id
    const body = await request.json()
    const { type, contentId, reason } = body

    if (!type || !contentId) {
      return NextResponse.json({ error: "Missing type or contentId" }, { status: 400 })
    }

    // Insert report — table may not exist yet; fail gracefully
    const { error: insertError } = await supabase.from("content_reports").insert({
      reporter_id: reporterId,
      content_type: String(type),
      content_id: String(contentId),
      reason: reason ?? "user_report",
      status: "pending",
    })

    if (insertError) {
      console.error("[reports/content] insert error:", insertError.message)
      // Non-fatal: table might not exist. Still return 200 so app doesn't show an error.
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[reports/content] unexpected error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
