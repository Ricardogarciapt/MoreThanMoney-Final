import { NextRequest, NextResponse } from 'next/server'

const BACKEND_BASE = (process.env.MTMCOPY_FASTAPI_URL || 'http://localhost:8000').replace(/\/$/, '')

type RouteContext = { params: Promise<{ path: string[] }> }

async function proxyRequest(request: NextRequest, context: RouteContext) {
  const { path } = await context.params
  const targetPath = `/${path.join('/')}`
  const url = new URL(targetPath, `${BACKEND_BASE}/`)
  url.search = request.nextUrl.search

  const headers = new Headers()
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (lower === 'host' || lower === 'connection') return
    headers.set(key, value)
  })

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer()
  }

  let upstream: Response
  try {
    upstream = await fetch(url.toString(), init)
  } catch (err) {
    console.error('[mtmcopy/engine] upstream indisponível:', err)
    return NextResponse.json(
      {
        error: 'Motor FastAPI descontinuado. MTMcopier usa Bot API na Vercel — /mtmcopy (cliente) ou /admin/mtmcopy (admin)',
      },
      { status: 410 },
    )
  }

  const responseHeaders = new Headers()
  const contentType = upstream.headers.get('content-type')
  if (contentType) responseHeaders.set('content-type', contentType)

  const body = await upstream.arrayBuffer()
  return new NextResponse(body, { status: upstream.status, headers: responseHeaders })
}

export const GET = proxyRequest
export const POST = proxyRequest
export const PUT = proxyRequest
export const PATCH = proxyRequest
export const DELETE = proxyRequest
export const OPTIONS = proxyRequest
