import { type NextRequest, NextResponse } from "next/server"
import { productsService } from "@/lib/products-service"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const product = await productsService.getProductById(params.id)

    if (!product) {
      return NextResponse.json(
        {
          success: false,
          error: "Produto não encontrado",
        },
        { status: 404 },
      )
    }

    return NextResponse.json({
      success: true,
      data: product,
    })
  } catch (error) {
    console.error("Erro ao obter produto:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro ao obter produto",
        details: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 },
    )
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const updates = await request.json()
    const product = await productsService.updateProduct(params.id, updates)

    if (!product) {
      return NextResponse.json(
        {
          success: false,
          error: "Produto não encontrado",
        },
        { status: 404 },
      )
    }

    return NextResponse.json({
      success: true,
      data: product,
      message: "Produto atualizado com sucesso",
    })
  } catch (error) {
    console.error("Erro ao atualizar produto:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro ao atualizar produto",
        details: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 },
    )
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const success = await productsService.deleteProduct(params.id)

    if (!success) {
      return NextResponse.json(
        {
          success: false,
          error: "Produto não encontrado ou erro ao deletar",
        },
        { status: 404 },
      )
    }

    return NextResponse.json({
      success: true,
      message: "Produto deletado com sucesso",
    })
  } catch (error) {
    console.error("Erro ao deletar produto:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro ao deletar produto",
        details: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 },
    )
  }
}
