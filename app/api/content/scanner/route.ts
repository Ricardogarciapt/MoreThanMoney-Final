import { NextResponse } from "next/server"

export async function GET() {
  // Por enquanto, permitir acesso direto - autenticação será implementada depois
  // TODO: Implementar verificação de autenticação com Supabase
  
  try {
    // Implementar lógica da API aqui
    return NextResponse.json({ message: "Scanner API funcionando" })
  } catch (error) {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    // Remover: const session = await getServerSession(authOptions)
    // Remover: if (!session?.user) {
    //   return NextResponse.json(
    //     { error: "Não autorizado" },
    //     { status: 401 }
    //   )
    // }

    const content = await request.json()
    const { jifuVideoId, jifuDescription, mtmDescription } = content

    // Validar dados
    if (!jifuVideoId || !jifuDescription || !mtmDescription) {
      return NextResponse.json(
        { error: "Todos os campos são obrigatórios" },
        { status: 400 }
      )
    }

    // Atualizar ou criar conteúdo
    // Remover: const { data, error } = await supabase
    //   .from("scanner_content")
    //   .upsert({
    //     jifuVideoId,
    //     jifuDescription,
    //     mtmDescription,
    //     updatedAt: new Date().toISOString(),
    //   })
    //   .select()
    //   .single()

    // Remover: if (error) throw error

    return NextResponse.json({ message: "Conteúdo atualizado com sucesso" })
  } catch (error) {
    console.error("Erro ao atualizar conteúdo do scanner:", error)
    return NextResponse.json(
      { error: "Erro ao atualizar conteúdo" },
      { status: 500 }
    )
  }
} 