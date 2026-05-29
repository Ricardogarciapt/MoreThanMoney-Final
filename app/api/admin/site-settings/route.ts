import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"

function isAuthorized(req: Request) {
  const token = process.env.ADMIN_TOKEN
  const header = req.headers.get("authorization") || ""
  return token && header === `Bearer ${token}`
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const filePath = path.join(process.cwd(), "data", "site-settings.json")
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"))
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const body = await req.json()
    const filePath = path.join(process.cwd(), "data", "site-settings.json")
    fs.writeFileSync(filePath, JSON.stringify(body, null, 2), "utf8")
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}


