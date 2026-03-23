import { NextResponse } from "next/server"
import { getEducatorCookieName } from "@/lib/lms-educator-auth"

export async function POST() {
  const response = NextResponse.json({ success: true })
  response.cookies.set(getEducatorCookieName(), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  })
  return response
}

