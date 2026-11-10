/**
 * ELEMENTOS VISUAIS dos carrosséis: pequenas ilustrações vectoriais do tema da lâmina, para a
 * publicação não ser só texto (pedido do Ricardo, 06/11/2026).
 *   · MTM: lâminas 2, 3, 4 e 5.
 *   · Ricardo: lâminas 3 e 6.
 * Discretas (cabem num cartão de ~300×200), nas cores da marca, SVG puro — o Satori desenha-o sem
 * rede nem ficheiros. A escolha é por palavras do texto da lâmina, sem repetir no mesmo carrossel.
 */
import React from 'react'
import type { Carrossel, Perfil } from './tipos'

export const VISUAIS = [
  'velas',
  'escudo',
  'alvo',
  'stop',
  'balanca',
  'relogio',
  'diario',
  'moedas',
  'telemovel',
  'copia',
  'alerta',
  'pausa',
  'calendario',
  'lupa',
  'banco',
  'fatia',
  'escada',
  'robo',
  'pessoas',
  'ouro',
] as const
export type VisualId = (typeof VISUAIS)[number]

/** Lâminas (índice a partir de 0) que levam elemento visual, por perfil. */
export const LAMINAS_COM_VISUAL: Record<Perfil, number[]> = { mtm: [1, 2, 3, 4], ricardo: [2, 5] }

/** Palavras → visual. A ordem conta: a primeira regra que bate ganha. */
const REGRAS: [RegExp, VisualId][] = [
  [/\b(stop|sl\b|sa[ií]das? quando|onde sais|break-?even)/, 'stop'],
  [/\b(alvo|tp\d?|take profit|objetivo|meta)/, 'alvo'],
  [/\b(alerta|cuidado|sinais? de alerta|promete|garant|esquema)/, 'alerta'],
  [/\b(recrut|trazer pessoas)/, 'pessoas'],
  [/\b(risco|arrisca|0,5%|1%|percent)/, 'fatia'],
  [/\b(protege|proteg|seguran|escudo|cust[oó]dia)/, 'escudo'],
  [/\b(recompensa|equil[ií]brio|compara|peso|vs\.?)/, 'balanca'],
  [/\b(tempo|minutos|hora|manh[aã]|rotina|sess[aã]o|sess[oõ]es)/, 'relogio'],
  [/\b(di[aá]rio|regist|aponta|anota|caderno)/, 'diario'],
  [/\b(dca|juros|compost|poupan|acumula|todos os meses|sextas)/, 'moedas'],
  [/\b(app|telem[oó]vel|toque|tap|notifica)/, 'telemovel'],
  [/\b(copi|copytrading|mestre|replica|seguir)/, 'copia'],
  [/\b(vingan|impulso|emo[cç]|calma|pausa|respira|medo|fomo|paci[eê]ncia)/, 'pausa'],
  [/\b(semana|m[eê]s|calend[aá]rio|dias?\b|prazo)/, 'calendario'],
  [/\b(pergunta|analisa|avalia|verifica|confirma|l[eê]r|lupa)/, 'lupa'],
  [/\b(corretora|regulad|conta em teu nome|banco|cmvm|fca|cysec)/, 'banco'],
  [/\b(evolu|aprend|passo|degrau|progress|primeiro m[eê]s|come[cç]a)/, 'escada'],
  [/\b(robo|robô|\bea\b|autom[aá]t|algoritmo)/, 'robo'],
  [/\b(comunidade|grupo|membros|mentor|equipa|juntos)/, 'pessoas'],
  [/\b(ouro|xau|gold|metais?)/, 'ouro'],
  [/\b(gr[aá]fico|vela|tend[eê]ncia|pre[cç]o|mercado|scanner|sinal|entrada)/, 'velas'],
]

/** Escolhe o visual de cada lâmina marcada; sem repetir dentro do carrossel. */
export function visuaisDoCarrossel(c: Pick<Carrossel, 'perfil' | 'laminas' | 'area'>): (VisualId | undefined)[] {
  const out: (VisualId | undefined)[] = c.laminas.map(() => undefined)
  const usados = new Set<VisualId>()
  const reserva: VisualId[] = ['velas', 'lupa', 'escada', 'alvo', 'relogio', 'diario', 'balanca', 'escudo']
  for (const i of LAMINAS_COM_VISUAL[c.perfil]) {
    const l = c.laminas[i]
    if (!l || i === 0 || i === c.laminas.length - 1) continue
    const texto = `${l.linha} ${l.titulo} ${l.corpo || ''}`.toLowerCase()
    let v = REGRAS.find(([re, id]) => re.test(texto) && !usados.has(id))?.[1]
    if (!v) v = REGRAS.find(([re, id]) => re.test(c.area.toLowerCase()) && !usados.has(id))?.[1]
    if (!v) v = reserva.find((r) => !usados.has(r))
    if (v) {
      usados.add(v)
      out[i] = v
    }
  }
  return out
}

type Cores = { cor: string; cor2: string }
const BR = 'rgba(255,255,255,0.88)'
const FRACO = 'rgba(255,255,255,0.22)'

/** As ilustrações, num viewBox 300×200. */
function corpo(id: VisualId, { cor, cor2 }: Cores): React.ReactNode {
  const s = { fill: 'none', strokeWidth: 6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (id) {
    case 'velas': {
      const v = [
        [40, 120, 150, 95, 165, 1],
        [80, 100, 130, 80, 145, 1],
        [120, 110, 140, 90, 155, 0],
        [160, 70, 105, 55, 120, 1],
        [200, 60, 85, 40, 100, 1],
        [240, 35, 65, 20, 80, 1],
      ]
      return (
        <g>
          <line x1="20" y1="185" x2="285" y2="185" stroke={FRACO} strokeWidth="3" />
          {v.map(([x, top, bot, hi, lo, up], k) => (
            <g key={k}>
              <line x1={x} y1={hi} x2={x} y2={lo} stroke={up ? cor2 : BR} strokeWidth="4" />
              <rect x={x - 11} y={top} width="22" height={bot - top} rx="3" fill={up ? cor : 'rgba(255,255,255,0.7)'} />
            </g>
          ))}
        </g>
      )
    }
    case 'escudo':
      return (
        <g>
          <path d="M150 18 L225 45 L225 100 C225 145 192 172 150 186 C108 172 75 145 75 100 L75 45 Z" stroke={cor} {...s} fill="rgba(255,255,255,0.04)" />
          <path d="M118 103 L142 127 L186 80" stroke={cor2} {...s} strokeWidth={10} />
        </g>
      )
    case 'alvo':
      return (
        <g>
          <circle cx="135" cy="105" r="78" stroke={FRACO} {...s} />
          <circle cx="135" cy="105" r="52" stroke={cor} {...s} />
          <circle cx="135" cy="105" r="24" stroke={cor2} {...s} />
          <circle cx="135" cy="105" r="7" fill={cor2} />
          <line x1="140" y1="100" x2="255" y2="22" stroke={BR} {...s} />
          <path d="M255 22 L232 26 M255 22 L250 45" stroke={BR} {...s} />
        </g>
      )
    case 'stop':
      return (
        <g>
          <polyline points="20,90 60,70 95,95 130,55 165,80 200,40 240,60 280,30" stroke={cor2} {...s} />
          <line x1="20" y1="150" x2="280" y2="150" stroke={BR} strokeWidth="4" strokeDasharray="14 10" />
          <rect x="196" y="160" width="84" height="32" rx="8" fill={cor} />
          <line x1="215" y1="176" x2="261" y2="176" stroke="#0b0b0b" strokeWidth="6" strokeLinecap="round" />
        </g>
      )
    case 'balanca':
      return (
        <g>
          <line x1="150" y1="30" x2="150" y2="180" stroke={BR} {...s} />
          <line x1="100" y1="185" x2="200" y2="185" stroke={BR} {...s} />
          <line x1="60" y1="62" x2="240" y2="44" stroke={cor} {...s} />
          <path d="M60 62 L35 120 L85 120 Z" stroke={cor2} {...s} />
          <path d="M240 44 L215 102 L265 102 Z" stroke={cor2} {...s} />
          <circle cx="150" cy="52" r="9" fill={cor} />
        </g>
      )
    case 'relogio':
      return (
        <g>
          <circle cx="150" cy="104" r="80" stroke={cor} {...s} />
          <path d="M150 104 L150 52 M150 104 L190 126" stroke={cor2} {...s} strokeWidth={8} />
          <circle cx="150" cy="104" r="8" fill={BR} />
          {[0, 90, 180, 270].map((a) => (
            <line key={a} x1="150" y1="34" x2="150" y2="44" stroke={BR} strokeWidth="6" transform={`rotate(${a} 150 104)`} />
          ))}
        </g>
      )
    case 'diario':
      return (
        <g>
          <rect x="80" y="20" width="140" height="168" rx="12" stroke={cor} {...s} />
          <line x1="104" y1="20" x2="104" y2="188" stroke={FRACO} strokeWidth="4" />
          {[60, 90, 120, 150].map((y) => (
            <line key={y} x1="122" y1={y} x2="198" y2={y} stroke={BR} strokeWidth="5" strokeLinecap="round" />
          ))}
          <path d="M210 150 L262 98 L276 112 L224 164 L206 168 Z" fill={cor2} />
        </g>
      )
    case 'moedas':
      return (
        <g>
          {[0, 1, 2, 3].map((k) => (
            <g key={k}>
              {Array.from({ length: k + 2 }).map((_, j) => (
                <ellipse key={j} cx={60 + k * 60} cy={176 - j * 20} rx="24" ry="9" fill={j % 2 ? cor2 : cor} stroke="#0b0b0b" strokeWidth="2" />
              ))}
            </g>
          ))}
          <polyline points="40,92 100,78 160,58 220,32 262,20" stroke={BR} {...s} strokeWidth={4} />
        </g>
      )
    case 'telemovel':
      return (
        <g>
          <rect x="105" y="10" width="92" height="184" rx="16" stroke={cor} {...s} />
          <line x1="138" y1="24" x2="164" y2="24" stroke={FRACO} strokeWidth="5" strokeLinecap="round" />
          <polyline points="118,130 135,112 152,122 170,90 186,98" stroke={cor2} {...s} strokeWidth={5} />
          <rect x="120" y="150" width="62" height="24" rx="12" fill={cor} />
          <circle cx="235" cy="60" r="12" fill={cor2} />
          <path d="M222 92 C238 82 252 82 266 92" stroke={BR} {...s} strokeWidth={4} />
        </g>
      )
    case 'copia':
      return (
        <g>
          <rect x="22" y="40" width="104" height="76" rx="10" stroke={cor} {...s} />
          <rect x="174" y="40" width="104" height="76" rx="10" stroke={cor2} {...s} />
          <polyline points="34,100 56,80 76,92 112,60" stroke={cor} {...s} strokeWidth={4} />
          <polyline points="186,100 208,80 228,92 264,60" stroke={cor2} {...s} strokeWidth={4} />
          <path d="M132 78 L168 78 M158 66 L170 78 L158 90" stroke={BR} {...s} />
          <line x1="50" y1="150" x2="250" y2="150" stroke={FRACO} strokeWidth="4" strokeDasharray="10 10" />
          <circle cx="150" cy="150" r="14" fill={cor} />
        </g>
      )
    case 'alerta':
      return (
        <g>
          <path d="M150 20 L262 184 L38 184 Z" stroke={cor} {...s} strokeWidth={8} fill="rgba(255,255,255,0.04)" />
          <line x1="150" y1="78" x2="150" y2="132" stroke={cor2} {...s} strokeWidth={12} />
          <circle cx="150" cy="158" r="8" fill={cor2} />
        </g>
      )
    case 'pausa':
      return (
        <g>
          <circle cx="150" cy="104" r="80" stroke={cor} {...s} />
          <rect x="120" y="66" width="20" height="76" rx="6" fill={cor2} />
          <rect x="160" y="66" width="20" height="76" rx="6" fill={cor2} />
          <path d="M30 180 C70 160 100 196 140 176 C180 156 220 196 270 172" stroke={FRACO} {...s} strokeWidth={4} />
        </g>
      )
    case 'calendario':
      return (
        <g>
          <rect x="60" y="34" width="180" height="152" rx="14" stroke={cor} {...s} />
          <line x1="60" y1="72" x2="240" y2="72" stroke={cor} strokeWidth="6" />
          <line x1="100" y1="20" x2="100" y2="48" stroke={BR} {...s} />
          <line x1="200" y1="20" x2="200" y2="48" stroke={BR} {...s} />
          {[0, 1, 2, 3].map((cX) =>
            [0, 1, 2].map((r) => <rect key={`${cX}${r}`} x={82 + cX * 38} y={88 + r * 30} width="22" height="18" rx="4" fill={cX === 2 && r === 1 ? cor2 : FRACO} />),
          )}
        </g>
      )
    case 'lupa':
      return (
        <g>
          <polyline points="20,160 60,130 95,145 130,100 165,118" stroke={FRACO} {...s} />
          <circle cx="150" cy="92" r="58" stroke={cor} {...s} strokeWidth={8} />
          <polyline points="108,110 128,88 148,100 176,70" stroke={cor2} {...s} strokeWidth={5} />
          <line x1="192" y1="134" x2="250" y2="190" stroke={cor} {...s} strokeWidth={14} />
        </g>
      )
    case 'banco':
      return (
        <g>
          <path d="M40 72 L150 18 L260 72 Z" stroke={cor} {...s} fill="rgba(255,255,255,0.04)" />
          {[70, 120, 180, 230].map((x) => (
            <line key={x} x1={x} y1="86" x2={x} y2="160" stroke={BR} strokeWidth="10" strokeLinecap="round" />
          ))}
          <line x1="36" y1="178" x2="264" y2="178" stroke={cor2} {...s} strokeWidth={10} />
          <circle cx="150" cy="50" r="8" fill={cor2} />
        </g>
      )
    case 'fatia':
      return (
        <g>
          <circle cx="130" cy="104" r="80" fill="rgba(255,255,255,0.10)" stroke={FRACO} strokeWidth="4" />
          <path d="M130 104 L130 24 A80 80 0 0 1 172 36 Z" fill={cor} />
          <path d="M150 76 L230 44" stroke={BR} {...s} strokeWidth={4} />
          <circle cx="250" cy="38" r="20" stroke={cor2} {...s} />
          <circle cx="250" cy="38" r="6" fill={cor2} />
        </g>
      )
    case 'escada':
      return (
        <g>
          <path d="M30 186 L90 186 L90 146 L150 146 L150 106 L210 106 L210 66 L270 66" stroke={cor} {...s} strokeWidth={8} />
          <circle cx="240" cy="38" r="14" fill={cor2} />
          <path d="M60 170 L60 186 M120 130 L120 146 M180 90 L180 106" stroke={FRACO} {...s} />
        </g>
      )
    case 'robo':
      return (
        <g>
          <rect x="80" y="54" width="140" height="110" rx="20" stroke={cor} {...s} />
          <line x1="150" y1="54" x2="150" y2="26" stroke={BR} {...s} />
          <circle cx="150" cy="20" r="8" fill={cor2} />
          <circle cx="122" cy="100" r="13" fill={cor2} />
          <circle cx="178" cy="100" r="13" fill={cor2} />
          <line x1="118" y1="134" x2="182" y2="134" stroke={BR} {...s} />
          <line x1="80" y1="108" x2="58" y2="108" stroke={cor} {...s} />
          <line x1="220" y1="108" x2="242" y2="108" stroke={cor} {...s} />
        </g>
      )
    case 'pessoas':
      return (
        <g>
          {[
            [90, 70, FRACO],
            [210, 70, FRACO],
            [150, 56, cor],
          ].map(([x, y, c], k) => (
            <g key={k}>
              <circle cx={x as number} cy={y as number} r="24" stroke={c as string} {...s} />
              <path d={`M${(x as number) - 42} ${(y as number) + 104} C${(x as number) - 42} ${(y as number) + 50} ${(x as number) + 42} ${(y as number) + 50} ${(x as number) + 42} ${(y as number) + 104}`} stroke={c as string} {...s} />
            </g>
          ))}
          <line x1="60" y1="190" x2="240" y2="190" stroke={cor2} {...s} />
        </g>
      )
    case 'ouro':
      return (
        <g>
          <path d="M60 170 L90 120 L170 120 L200 170 Z" fill={cor} />
          <path d="M120 120 L150 70 L230 70 L260 120 Z" fill={cor2} />
          <path d="M100 116 L118 86 L178 86" stroke="rgba(255,255,255,0.55)" strokeWidth="4" fill="none" />
          <path d="M40 60 L48 44 L56 60 L72 68 L56 76 L48 92 L40 76 L24 68 Z" fill={BR} />
        </g>
      )
  }
}

/** O cartão com a ilustração: discreto, alinhado à esquerda do texto. */
export function Visual({ id, cor, cor2, largura = 330 }: { id: VisualId; cor: string; cor2: string; largura?: number }) {
  const altura = Math.round((largura * 200) / 300)
  return (
    <div
      style={{
        display: 'flex',
        width: largura + 40,
        height: altura + 32,
        padding: '16px 20px',
        borderRadius: 28,
        background: 'rgba(255,255,255,0.045)',
        border: '2px solid rgba(255,255,255,0.10)',
      }}
    >
      <svg width={largura} height={altura} viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg">
        {corpo(id, { cor, cor2 })}
      </svg>
    </div>
  )
}
