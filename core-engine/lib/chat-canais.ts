/**
 * Os canais do chat tal como o ADMIN os configurou — módulo PURO (sem chave de serviço), partilhado
 * pelo `/api/chat/canais` (apps nativas), pelo chat da app-mobile (web e Android) e pelos testes.
 *
 * Tudo o que se mostra de um canal vem da linha de `chat_channels`: nome, descrição, ordem,
 * escondido, ícone, cor, etiqueta, regras, e quem lê / quem escreve. O que estiver a null cai no
 * valor de sempre (CHANNEL_META para o visual, lib/chat-channel-permissions para as permissões) —
 * por isso isto funciona antes e depois da migração 117.
 */
import { CHANNEL_META } from '@/components/mobile/chat-channel-meta'
import {
  canReadChannel,
  canWriteChannel,
  isReadOnlyChannel,
  nivelEscrita,
  nivelLeitura,
  requiresBrokerUidChannel,
  type ChatChannelUser,
  type NivelEscrita,
  type NivelLeitura,
} from '@/lib/chat-channel-permissions'

/** A linha da tabela (colunas da 117 opcionais). */
export interface LinhaCanal {
  id?: string
  slug: string
  name: string
  description?: string | null
  parent_slug?: string | null
  position?: number | null
  hidden?: boolean | null
  icone?: string | null
  cor?: string | null
  etiqueta?: string | null
  regras?: string[] | null
  leitura?: string | null
  escrita?: string | null
  exige_uid_corretora?: boolean | null
}

/** O canal pronto a desenhar numa app. */
export interface CanalApp {
  id: string | null
  slug: string
  name: string
  description: string | null
  parent_slug: string | null
  position: number
  icone: string
  cor: string
  etiqueta: string | null
  regras: string[]
  leitura: NivelLeitura
  escrita: NivelEscrita
  exige_uid_corretora: boolean
  /** Calculados para quem pediu (null = pedido sem sessão). */
  pode_ler: boolean | null
  pode_escrever: boolean | null
  so_leitura: boolean
}

const COR_OMISSAO = '#9CA3AF'
const ICONE_OMISSAO = '#'

function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** Uma linha da base → o canal da app (visual + permissões efectivas). */
export function canalParaApp(l: LinhaCanal, user?: ChatChannelUser | null): CanalApp {
  const meta = CHANNEL_META[l.slug]
  const cfg = { slug: l.slug, leitura: l.leitura, escrita: l.escrita, exige_uid_corretora: l.exige_uid_corretora }
  const cor = texto(l.cor)
  const regras = Array.isArray(l.regras) ? l.regras.map((r) => String(r).trim()).filter(Boolean) : []
  return {
    id: l.id ?? null,
    slug: l.slug,
    name: l.name,
    description: texto(l.description),
    parent_slug: texto(l.parent_slug),
    position: Number.isFinite(Number(l.position)) ? Number(l.position) : 0,
    icone: texto(l.icone) ?? meta?.emoji ?? ICONE_OMISSAO,
    cor: cor && /^#[0-9A-Fa-f]{6}$/.test(cor) ? cor : meta?.accent ?? COR_OMISSAO,
    etiqueta: texto(l.etiqueta) ?? meta?.tag ?? null,
    regras: regras.length ? regras : meta?.rules ?? [],
    leitura: nivelLeitura(l.slug, cfg),
    escrita: nivelEscrita(l.slug, cfg),
    exige_uid_corretora: requiresBrokerUidChannel(l.slug, cfg),
    pode_ler: user === undefined ? null : canReadChannel(l.slug, user, cfg),
    pode_escrever: user === undefined ? null : canWriteChannel(l.slug, user, cfg),
    so_leitura: isReadOnlyChannel(l.slug, cfg),
  }
}

/**
 * A lista que as apps mostram: sem os escondidos, pela ordem do admin (posição, depois nome).
 * Um filho cujo pai está escondido desaparece com ele — é o que a lista em árvore já fazia.
 */
export function canaisVisiveis(linhas: LinhaCanal[], user?: ChatChannelUser | null): CanalApp[] {
  const visiveis = linhas.filter((l) => l.hidden !== true)
  const slugs = new Set(visiveis.map((l) => l.slug))
  return visiveis
    .filter((l) => !l.parent_slug || slugs.has(l.parent_slug))
    .map((l) => canalParaApp(l, user))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'pt'))
}
