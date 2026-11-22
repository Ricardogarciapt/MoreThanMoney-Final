import { NextRequest } from 'next/server'
import { deleteMcpSkool, getMcpSkool, postMcpSkool } from '@/lib/skool/mcp-servidor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Conector MCP do Skool com a chave no URL (conectores personalizados do claude.ai). */
type Ctx = { params: Promise<{ chave: string }> }
export async function POST(req: NextRequest, { params }: Ctx) {
  return postMcpSkool(req, (await params).chave)
}
export async function GET(req: NextRequest, { params }: Ctx) {
  return getMcpSkool(req, (await params).chave)
}
export const DELETE = () => deleteMcpSkool()
