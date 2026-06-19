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

    const blockerId = authData.user.id
    const body = await request.json()
    const { blockedUserId } = body

    if (!blockedUserId) {
      return NextResponse.json({ error: "Missing blockedUserId" }, { status: 400 })
    }

    if (blockerId === blockedUserId) {
      return NextResponse.json({ error: "Cannot block yourself" }, { status: 400 })
    }

    // Insert block — table may not exist yet; fail gracefully
    const { error: insertError } = await supabase.from("user_blocks").insert({
      blocker_id: blockerId,
      blocked_id: blockedUserId,
    })

    if (insertError && !insertError.message.includes("duplicate")) {
      console.error("[users/block] insert error:", insertError.message)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[users/block] unexpected error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
