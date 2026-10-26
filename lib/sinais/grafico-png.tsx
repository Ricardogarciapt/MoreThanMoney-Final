import { ImageResponse } from "next/og"
import type { DesenhoVelas } from "@/lib/sinais/grafico-velas"

/**
 * PNG do desenho (para o Telegram). O resvg do Satori não tem fontes para os <text> de um SVG
 * embebido — saíam em branco —, por isso vai o SVG SEM texto por baixo e cada texto por cima,
 * posicionado em absoluto e desenhado com a fonte do próprio Satori.
 */
export function pngDoDesenho(d: DesenhoVelas, cache: string) {
  const fundo = `data:image/svg+xml;base64,${Buffer.from(d.svgSemTexto).toString("base64")}`
  return new ImageResponse(
    (
      <div style={{ display: "flex", position: "relative", width: d.largura, height: d.altura, background: "#0b0d12" }}>
        <img src={fundo} alt="" width={d.largura} height={d.altura} style={{ position: "absolute", left: 0, top: 0 }} />
        {d.textos.map((t, i) => {
          // y do SVG é a linha de base; com lineHeight 1 a base fica a ~0,8 do tamanho do topo.
          const comum = {
            position: "absolute" as const,
            top: Math.round(t.y - t.tam * 0.8),
            display: "flex",
            color: t.cor,
            fontSize: t.tam,
            fontWeight: t.peso ?? 400,
            letterSpacing: t.espacamento ?? 0,
            lineHeight: 1,
            whiteSpace: "nowrap" as const,
          }
          const pos =
            t.ancora === "end"
              ? { right: Math.round(d.largura - t.x) }
              : t.ancora === "middle"
                ? { left: Math.round(t.x - 150), width: 300, justifyContent: "center" }
                : { left: Math.round(t.x) }
          return <div key={i} style={{ ...comum, ...pos }}>{t.texto}</div>
        })}
      </div>
    ),
    { width: d.largura, height: d.altura, headers: { "Cache-Control": cache } },
  )
}
