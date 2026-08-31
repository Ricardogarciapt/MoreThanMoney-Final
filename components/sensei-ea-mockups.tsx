/**
 * Os três ecrãs do MTM Sensei, desenhados em SVG.
 *
 * São desenhos, não capturas — e dizem-no na legenda. Uma captura de ecrã de um backtest passa
 * por prova de resultados sem o ser; um desenho mostra a mesma coisa (o que aparece no gráfico,
 * onde ficam os botões) sem sugerir lucros que não vendemos.
 */

const OURO = "#D2A63C"
const OURO_CLARO = "#F4D03F"

export function MockupGrafico({ className }: { className?: string }) {
  // Velas geradas à mão para desenhar uma perna de subida com pullback — o padrão que a
  // estratégia procura. Cada tuplo é [x, abertura, fecho, máximo, mínimo].
  const velas: Array<[number, number, number, number, number]> = [
    [20, 168, 158, 152, 174], [34, 158, 163, 150, 170], [48, 163, 149, 143, 168],
    [62, 149, 152, 141, 160], [76, 152, 140, 133, 156], [90, 140, 131, 124, 145],
    [104, 131, 137, 126, 142], [118, 137, 126, 118, 140], [132, 126, 118, 110, 130],
    [146, 118, 124, 112, 129], [160, 124, 112, 104, 127], [174, 112, 104, 96, 116],
    [188, 104, 110, 100, 115], [202, 110, 99, 92, 113], [216, 99, 90, 84, 102],
    [230, 90, 96, 86, 100], [244, 96, 86, 78, 99], [258, 86, 76, 70, 90],
    [272, 76, 82, 73, 87], [286, 82, 70, 62, 85], [300, 70, 60, 54, 74],
    [314, 60, 66, 57, 70], [328, 66, 55, 48, 69], [342, 55, 46, 40, 58],
  ]

  return (
    <svg viewBox="0 0 620 300" className={className} role="img" aria-label="Ilustração do gráfico com os traçados do Sensei">
      <rect width="620" height="300" fill="#0B0B0F" rx="10" />

      {/* grelha */}
      {[60, 120, 180, 240].map((y) => (
        <line key={y} x1="14" y1={y} x2="606" y2={y} stroke="#1C1C24" strokeWidth="1" />
      ))}

      {/* zona de order block */}
      <rect x="150" y="104" width="180" height="26" fill={OURO} opacity="0.12" />
      <text x="156" y="121" fill={OURO} fontSize="8.5" fontFamily="monospace">ORDER BLOCK</text>

      {/* DEMAs */}
      <path d="M20 172 C 90 150, 160 128, 230 106 S 380 74, 480 56 L 600 44"
            fill="none" stroke={OURO} strokeWidth="1.6" opacity="0.85" />
      <path d="M20 182 C 90 164, 160 144, 230 122 S 380 90, 480 70 L 600 58"
            fill="none" stroke="#5FA8FF" strokeWidth="1.3" opacity="0.6" />

      {/* velas */}
      {velas.map(([x, o, c, hi, lo], i) => {
        const sobe = c < o
        const cor = sobe ? "#2FBF71" : "#E0525E"
        return (
          <g key={i}>
            <line x1={x} y1={hi} x2={x} y2={lo} stroke={cor} strokeWidth="1" />
            <rect x={x - 3.5} y={Math.min(o, c)} width="7" height={Math.max(2, Math.abs(c - o))} fill={cor} />
          </g>
        )
      })}

      {/* entrada e alvos */}
      {[
        { y: 96, cor: OURO_CLARO, txt: "ENTRADA" },
        { y: 76, cor: "#2FBF71", txt: "TP1" },
        { y: 58, cor: "#2FBF71", txt: "TP2" },
        { y: 42, cor: "#2FBF71", txt: "TP3" },
        { y: 148, cor: "#E0525E", txt: "STOP" },
      ].map(({ y, cor, txt }) => (
        <g key={txt}>
          <line x1="352" y1={y} x2="596" y2={y} stroke={cor} strokeWidth="1" strokeDasharray="4 4" opacity="0.8" />
          <text x="600" y={y + 3} fill={cor} fontSize="8" fontFamily="monospace" textAnchor="end" opacity="0.95">
            {txt}
          </text>
        </g>
      ))}

      {/* seta de sinal */}
      <path d="M342 168 l6 12 l-12 0 z" fill={OURO_CLARO} />
      <text x="336" y="192" fill={OURO_CLARO} fontSize="9" fontFamily="monospace">BUY 16/20</text>
    </svg>
  )
}

export function MockupPainel({ className }: { className?: string }) {
  const botoes = [
    ["AUTO", "#2FBF71"],
    ["BUY", "#2FBF71"],
    ["SELL", "#E0525E"],
    ["PARCIAL 25%", OURO],
    ["TRAIL · ATR", OURO],
    ["FECHAR TUDO", "#E0525E"],
  ] as const

  return (
    <svg viewBox="0 0 300 300" className={className} role="img" aria-label="Ilustração do painel de controlo do EA">
      <rect width="300" height="300" fill="#0B0B0F" rx="10" />
      <rect x="16" y="16" width="268" height="268" fill="#12121A" stroke={`${OURO}44`} rx="8" />

      <rect x="16" y="16" width="268" height="28" fill={OURO} opacity="0.14" rx="8" />
      <text x="30" y="35" fill={OURO} fontSize="11" fontFamily="monospace" fontWeight="bold">MTM SENSEI</text>
      <text x="268" y="35" fill="#6A6A78" fontSize="9" fontFamily="monospace" textAnchor="end">PT / EN</text>

      {botoes.map(([txt, cor], i) => {
        const y = 58 + i * 34
        return (
          <g key={txt}>
            <rect x="30" y={y} width="240" height="26" rx="5" fill={cor} opacity="0.14" stroke={`${cor}66`} />
            <text x="42" y={y + 17} fill={cor} fontSize="10" fontFamily="monospace">{txt}</text>
          </g>
        )
      })}

      <text x="30" y="272" fill="#6A6A78" fontSize="8.5" fontFamily="monospace">RISCO 1.0%   ·   XAUUSD H1</text>
    </svg>
  )
}

export function MockupConfirmacoes({ className }: { className?: string }) {
  const linhas: Array<[string, boolean]> = [
    ["Tendência HTF", true],
    ["EMA 200 (H4)", true],
    ["Estrutura (BOS)", true],
    ["Order block", true],
    ["Sweep de liquidez", true],
    ["POC / volume", true],
    ["RSI", false],
    ["ADX", true],
    ["Fluxo de ordens", true],
    ["Sessão", true],
  ]

  return (
    <svg viewBox="0 0 300 300" className={className} role="img" aria-label="Ilustração do painel de confirmações do Sensei">
      <rect width="300" height="300" fill="#0B0B0F" rx="10" />
      <rect x="16" y="16" width="268" height="268" fill="#12121A" stroke={`${OURO}44`} rx="8" />

      <text x="30" y="40" fill={OURO} fontSize="11" fontFamily="monospace" fontWeight="bold">CONFIRMAÇÕES</text>
      <text x="268" y="40" fill={OURO_CLARO} fontSize="13" fontFamily="monospace" textAnchor="end" fontWeight="bold">16/20</text>

      <rect x="30" y="50" width="240" height="4" rx="2" fill="#22222C" />
      <rect x="30" y="50" width="192" height="4" rx="2" fill={OURO} />

      {linhas.map(([txt, ok], i) => {
        const y = 74 + i * 20
        return (
          <g key={txt}>
            <circle cx="36" cy={y} r="3.5" fill={ok ? "#2FBF71" : "#3A3A46"} />
            <text x="48" y={y + 3.5} fill={ok ? "#C8C8D2" : "#5A5A66"} fontSize="9.5" fontFamily="monospace">{txt}</text>
          </g>
        )
      })}

      <text x="30" y="288" fill="#6A6A78" fontSize="8" fontFamily="monospace">actualiza a cada vela</text>
    </svg>
  )
}
