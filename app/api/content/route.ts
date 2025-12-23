import { NextResponse } from "next/server"

export async function GET() {
  // Por enquanto, permitir acesso direto - autenticação será implementada depois
  // TODO: Implementar verificação de autenticação com Supabase
  
  try {
    // Implementar lógica da API aqui
    return NextResponse.json({ message: "API funcionando" })
  } catch (error) {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return new NextResponse("Não autorizado", { status: 401 })
    }

    const body = await req.json()
    const { title, type, description, url, status } = body

    if (!title || !type || !url || !status) {
      return new NextResponse("Dados inválidos", { status: 400 })
    }

    const content = await contentService.create({
      title,
      type,
      description,
      url,
      status,
      userId: session.user.id,
    })

    return NextResponse.json(content)
  } catch (error) {
    console.error("[CONTENT_POST]", error)
    return new NextResponse("Erro interno", { status: 500 })
  }
} 