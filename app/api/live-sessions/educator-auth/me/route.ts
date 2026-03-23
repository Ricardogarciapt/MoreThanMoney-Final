import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getEducatorCookieName, verifyEducatorToken } from "@/lib/lms-educator-auth"

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get(getEducatorCookieName())?.value
  if (!token) {
    return NextResponse.json({ authenticated: false })
  }
  const payload = verifyEducatorToken(token)
  if (!payload) {
    return NextResponse.json({ authenticated: false })
  }
  return NextResponse.json({ authenticated: true, educator: payload })
}

