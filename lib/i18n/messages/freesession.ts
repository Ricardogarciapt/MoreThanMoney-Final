import type { Lang } from "../config"

// Namespace i18n da página pública /FreeSession. Fallback para PT nos idiomas em falta.
export const FREESESSION_MESSAGES: Partial<Record<Lang, Record<string, string>>> = {
  pt: {
    "freesession.badge": "Transmissões abertas a todos",
    "freesession.title": "Sessões Gratuitas",
    "freesession.subtitle":
      "Sessões ao vivo da MoreThanMoney, abertas a toda a gente — sem necessidade de conta. Com legendas traduzidas e dobragem na voz do educador.",
    "freesession.live": "AO VIVO",
    "freesession.emptyTitle": "Nenhuma sessão gratuita ao vivo neste momento",
    "freesession.emptyText":
      "As sessões gratuitas aparecem aqui automaticamente quando arrancam. Volta na próxima sessão agendada.",
    "freesession.upcoming": "Próximas sessões gratuitas",
    "freesession.sessionFallback": "Sessão ao vivo",
    "freesession.viewAll": "Ver todas as sessões",
  },
  en: {
    "freesession.badge": "Open to everyone",
    "freesession.title": "Free Sessions",
    "freesession.subtitle":
      "MoreThanMoney live sessions, open to everyone — no account needed. With translated captions and dubbing in the educator's voice.",
    "freesession.live": "LIVE",
    "freesession.emptyTitle": "No free session live right now",
    "freesession.emptyText":
      "Free sessions show up here automatically when they start. Come back for the next scheduled one.",
    "freesession.upcoming": "Upcoming free sessions",
    "freesession.sessionFallback": "Live session",
    "freesession.viewAll": "See all sessions",
  },
  es: {
    "freesession.badge": "Abierto a todos",
    "freesession.title": "Sesiones Gratuitas",
    "freesession.subtitle":
      "Sesiones en vivo de MoreThanMoney, abiertas a todos — sin necesidad de cuenta. Con subtítulos traducidos y doblaje en la voz del educador.",
    "freesession.live": "EN VIVO",
    "freesession.emptyTitle": "No hay sesión gratuita en vivo en este momento",
    "freesession.emptyText":
      "Las sesiones gratuitas aparecen aquí automáticamente cuando empiezan. Vuelve en la próxima sesión programada.",
    "freesession.upcoming": "Próximas sesiones gratuitas",
    "freesession.sessionFallback": "Sesión en vivo",
    "freesession.viewAll": "Ver todas las sesiones",
  },
  fr: {
    "freesession.badge": "Ouvert à tous",
    "freesession.title": "Sessions Gratuites",
    "freesession.subtitle":
      "Sessions en direct MoreThanMoney, ouvertes à tous — sans compte. Avec sous-titres traduits et doublage dans la voix de l'éducateur.",
    "freesession.live": "EN DIRECT",
    "freesession.emptyTitle": "Aucune session gratuite en direct pour le moment",
    "freesession.emptyText":
      "Les sessions gratuites apparaissent ici automatiquement au démarrage. Revenez pour la prochaine session programmée.",
    "freesession.upcoming": "Prochaines sessions gratuites",
    "freesession.sessionFallback": "Session en direct",
    "freesession.viewAll": "Voir toutes les sessions",
  },
  de: {
    "freesession.badge": "Offen für alle",
    "freesession.title": "Kostenlose Sitzungen",
    "freesession.subtitle":
      "MoreThanMoney-Livesitzungen, offen für alle — ohne Konto. Mit übersetzten Untertiteln und Synchronisation in der Stimme des Educators.",
    "freesession.live": "LIVE",
    "freesession.emptyTitle": "Derzeit keine kostenlose Sitzung live",
    "freesession.emptyText":
      "Kostenlose Sitzungen erscheinen hier automatisch, sobald sie starten. Komm zur nächsten geplanten Sitzung wieder.",
    "freesession.upcoming": "Nächste kostenlose Sitzungen",
    "freesession.sessionFallback": "Livesitzung",
    "freesession.viewAll": "Alle Sitzungen ansehen",
  },
}
