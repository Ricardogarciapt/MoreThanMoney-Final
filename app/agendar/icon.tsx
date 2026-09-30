import { ImageResponse } from "next/og"

/**
 * O ÍCONE DE /agendar — e NÃO é o logótipo da casa, por pedido do dono.
 *
 * Um link de agenda vive num separador aberto ao lado de outros doze e num cartão do Beacons. Ali,
 * o que serve é um símbolo que diga o que a página FAZ. O logótipo diz de quem é a página — que é a
 * pergunta que ninguém faz quando já carregou no botão «agenda já».
 *
 * Desenhado aqui, e não como ficheiro: são dez linhas, escala para qualquer tamanho, e usa o ouro
 * da casa sem ser a marca.
 */

export const size = { width: 64, height: 64 }
export const contentType = "image/png"

export default function Icone() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          background: "#0B0B0D", borderRadius: 14,
        }}
      >
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#D2A63C" strokeWidth="2" strokeLinecap="round">
          {/* a folha do calendário */}
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M3 10h18" />
          <path d="M8 3v4M16 3v4" />
          {/* o visto: o que a página faz é FECHAR uma marcação */}
          <path d="M9 15.5l2 2 4-4" stroke="#E9C46A" />
        </svg>
      </div>
    ),
    size,
  )
}
