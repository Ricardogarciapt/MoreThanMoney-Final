/**
 * O NOME DE UMA FONTE T2T, um só. IGUAL nos dois repositórios.
 *
 * Havia TRÊS tabelas de nomes para os mesmos oito canais:
 *   · `ROTULOS_CANAIS_T2T` em `lib/mtmcopy/tap-to-trade-channels.ts` — a do admin e do servidor;
 *   · `CHANNEL_LABEL` dentro de `components/mobile/tap-to-trade-feed.tsx` — a do separador T2T;
 *   · `ROTULO_CANAL` em `lib/t2t-tipos.ts` no mtm-auto — a do /sinais.
 *
 * E não diziam o mesmo: o admin chamava-lhe «MTM Auto Premium» (que é o nome do canal no chat,
 * posto a 24/09) e as duas apps «Premium · Ouro». Quem liga uma fonte no painel não a reconhecia
 * na app que acabou de ligar, e quem lia o sinal no chat via outro nome por cima do mesmo sinal
 * no separador ao lado.
 *
 * Manda o nome do CANAL NO CHAT: é o que a pessoa lê primeiro e o que o admin lista. Esta tabela
 * é a rede de segurança para quando não temos a linha do canal à mão — quem a tiver deve passar
 * o nome vivo a `rotuloCanalT2T`.
 *
 * ⚠️ Módulo PURO: é importado por um componente de cliente. Nada de servidor aqui dentro.
 */
export const ROTULOS_CANAIS_T2T: Record<string, string> = {
  'premium-ideas': 'MTM Auto Premium',
  'sensei-scanner': 'MTM Auto Sensei',
  'sinais-goldkiller': 'Sinais Scanner Gold Killer',
  'sinais-scanner-mtm': 'MTM Auto Edge/Wolf/King',
  'aurum-flow': 'MTM Auto Aurum Flow & Perpétuos',
  // 18/09: `cripto-perps` fundido em `aurum-flow`; o slug antigo fica até correr a migração 118.
  'cripto-perps': 'MTM Auto Aurum Flow & Perpétuos',
  'trade-ideas-setup': 'Ideias de Forex',
  'trade-ideas': 'Ideias de Índices',
  // Swings: entram e ficam. Vão para T2T sem motor de gestão — só se acompanha o desfecho.
  'ideias-e-sinais': 'Ideias e Sinais',
  // Slug antigo da Aurum Flow — remover depois de 2026-10-14 (30 dias após 2026-09-14).
  'golden-moves': 'MTM Auto Aurum Flow & Perpétuos',
}

/** O nome a mostrar: o do canal no chat se o tivermos, senão o canónico, senão o slug. */
export function rotuloCanalT2T(slug: string, nomeDoChat?: string | null): string {
  const s = String(slug ?? '').trim()
  const vivo = String(nomeDoChat ?? '').trim()
  return vivo || ROTULOS_CANAIS_T2T[s] || s
}

/** Iniciais da fonte — o avatar redondo do cartão, o mesmo nas duas apps. */
export function iniciaisDaFonte(nome: string): string {
  const p = String(nome ?? '')
    .replace(/[^A-Za-zÀ-ú0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? p[0]?.[1] ?? '')).toUpperCase()
}
