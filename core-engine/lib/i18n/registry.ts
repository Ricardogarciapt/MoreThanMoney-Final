import { I18N_LANGS, type Lang } from "./config"
import { MESSAGES as CORE } from "./messages"

// ── Namespaces (cada lote de migração cria o seu ficheiro e regista-o aqui) ──
import { REGISTER_MESSAGES } from "./messages/register"
import { UPGRADE_MESSAGES } from "./messages/upgrade"
import { APPMOBILE_MESSAGES } from "./messages/app-mobile"
import { LANDING_MESSAGES } from "./messages/landing"
import { LANDING2_MESSAGES } from "./messages/landing2"
import { NAVFOOTER_MESSAGES } from "./messages/navfooter"
import { CHAT_MESSAGES } from "./messages/chat"
import { LIVE_MESSAGES } from "./messages/live"
import { SCANNER_MESSAGES } from "./messages/scanner"
import { MEMBERAREA_MESSAGES } from "./messages/memberarea"
import { T2T_MESSAGES } from "./messages/t2t"
import { PORTFOLIO_MESSAGES } from "./messages/portfolio"
import { MTMCOPIER_MESSAGES } from "./messages/mtmcopier"
import { FREESESSION_MESSAGES } from "./messages/freesession"
import { MTMFUNDED_MESSAGES } from "./messages/mtmfunded"
import { MTMFUNDED_AVISO_MESSAGES } from "./messages/mtmfunded-aviso"
import { WEBTRADER_ENTRAR_MESSAGES } from "./messages/webtrader-entrar"

type NsSource = Partial<Record<Lang, Record<string, string>>>

function merge(...sources: NsSource[]): Record<Lang, Record<string, string>> {
  const out = {} as Record<Lang, Record<string, string>>
  for (const lang of I18N_LANGS) {
    const acc: Record<string, string> = {}
    for (const src of sources) {
      const d = src[lang]
      if (d) Object.assign(acc, d)
    }
    out[lang] = acc
  }
  return out
}

/** Dicionário agregado (núcleo + todos os namespaces). */
export const ALL_MESSAGES = merge(
  CORE,
  REGISTER_MESSAGES,
  UPGRADE_MESSAGES,
  APPMOBILE_MESSAGES,
  LANDING_MESSAGES,
  LANDING2_MESSAGES,
  NAVFOOTER_MESSAGES,
  CHAT_MESSAGES,
  LIVE_MESSAGES,
  SCANNER_MESSAGES,
  MEMBERAREA_MESSAGES,
  T2T_MESSAGES,
  PORTFOLIO_MESSAGES,
  MTMCOPIER_MESSAGES,
  FREESESSION_MESSAGES,
  MTMFUNDED_MESSAGES,
  MTMFUNDED_AVISO_MESSAGES,
  WEBTRADER_ENTRAR_MESSAGES,
)
