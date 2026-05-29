import { type NextRequest, NextResponse } from "next/server"
import { productsService } from "@/lib/products-service"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get("category")
    const status = searchParams.get("status")

    let products
    if (category) {
      products = await productsService.getProductsByCategory(category)
    } else if (status === "active") {
      products = await productsService.getActiveProducts()
    } else {
      products = await productsService.getAllProducts()
    }

    return NextResponse.json(products)
  } catch (error) {
    console.error("Erro ao obter produtos:", error)
    return NextResponse.json([], { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const productData = await request.json()

    // Validar dados obrigatórios
    if (!productData.name || !productData.description || !productData.price) {
      return NextResponse.json(
        {
          success: false,
          error: "Campos obrigatórios: name, description, price",
        },
        { status: 400 },
      )
    }

    const product = await productsService.createProduct(productData)

    return NextResponse.json({
      success: true,
      data: product,
      message: "Produto criado com sucesso",
    })
  } catch (error) {
    console.error("Erro ao criar produto:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Erro ao criar produto",
        details: error instanceof Error ? error.message : "Erro desconhecido",
      },
      { status: 500 },
    )
  }
}
