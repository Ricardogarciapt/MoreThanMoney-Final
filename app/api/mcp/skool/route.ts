import { NextRequest } from 'next/server'
import { deleteMcpSkool, getMcpSkool, postMcpSkool } from '@/lib/skool/mcp-servidor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Conector MCP do Skool com `Authorization: Bearer <SKOOL_MCP_TOKEN>`. Ver lib/skool/LEIA-ME.md. */
export const POST = (req: NextRequest) => postMcpSkool(req)
export const GET = (req: NextRequest) => getMcpSkool(req)
export const DELETE = () => deleteMcpSkool()
