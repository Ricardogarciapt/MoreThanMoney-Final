import { type NextRequest, NextResponse } from "next/server"
import { ideasService } from "@/lib/ideas-service"

// API para gerenciar uma ideia de trading específica
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const idea = await ideasService.getIdeaById(params.id)

    if (!idea) {
      return NextResponse.json({ error: "Ideia não encontrada" }, { status: 404 })
    }

    return NextResponse.json({ idea })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const data = await request.json()
    const idea = await ideasService.updateIdea(params.id, data)

    if (!idea) {
      return NextResponse.json({ error: "Ideia não encontrada" }, { status: 404 })
    }

    return NextResponse.json({ idea })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const success = await ideasService.deleteIdea(params.id)

    if (!success) {
      return NextResponse.json({ error: "Ideia não encontrada" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
