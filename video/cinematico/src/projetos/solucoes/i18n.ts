import { getInputProps } from 'remotion'

// Textos do ecrã do vídeo /solucoes nas outras línguas. O idioma vem das props (--idioma=en|de|fr; omissão pt).
// Títulos com destaque: [texto, palavras a ouro]. Nomes (Rita, Estúdio Ana) e o URL ficam iguais.
export type Idioma = 'pt' | 'en' | 'de' | 'fr'
export const idioma = (): Idioma => {
  try { const l = (getInputProps() as { idioma?: string }).idioma; return l === 'en' || l === 'de' || l === 'fr' ? l : 'pt' } catch { return 'pt' }
}

type Entrada = string | [string, string[]]
const D: Record<string, Partial<Record<Exclude<Idioma, 'pt'>, Entrada>>> = {
  // Relógio
  'E ainda estás a responder a mensagens?': {
    en: ['And you\'re still answering messages?', ['messages']],
    de: ['Und du beantwortest immer noch Nachrichten?', ['Nachrichten']],
    fr: ['Et tu réponds encore aux messages ?', ['messages']],
  },
  // Caos
  'Agenda em papel.': { en: 'Paper diary.', de: 'Papierkalender.', fr: 'Agenda papier.' },
  'Mensagens perdidas.': { en: 'Lost messages.', de: 'Verlorene Nachrichten.', fr: 'Messages perdus.' },
  'Clientes que não voltam.': { en: 'Clients who never return.', de: 'Kunden, die nie wiederkommen.', fr: 'Des clients qui ne reviennent pas.' },
  'Olá! Ainda há vaga amanhã?': { en: 'Hi! Any slots left tomorrow?', de: 'Hallo! Ist morgen noch was frei?', fr: 'Salut ! Il reste une place demain ?' },
  'Qual é o preço?': { en: 'How much is it?', de: 'Was kostet das?', fr: 'C\'est combien ?' },
  'Consegue ligar-me?': { en: 'Can you call me?', de: 'Kannst du mich anrufen?', fr: 'Tu peux m\'appeler ?' },
  'Tenho de desmarcar a de quinta 😕': { en: 'I need to cancel Thursday 😕', de: 'Ich muss Donnerstag absagen 😕', fr: 'Je dois annuler jeudi 😕' },
  'Já enviei mensagem ontem…': { en: 'I already messaged yesterday…', de: 'Hab gestern schon geschrieben…', fr: 'J\'ai déjà écrit hier…' },
  'Estão abertos ao sábado?': { en: 'Are you open on Saturday?', de: 'Habt ihr samstags offen?', fr: 'Vous ouvrez le samedi ?' },
  'agora': { en: 'now', de: 'jetzt', fr: 'maintenant' },
  // Transforma
  'E se o teu negócio trabalhasse por ti?': {
    en: ['What if your business worked for you?', ['worked', 'for', 'you']],
    de: ['Was, wenn dein Business für dich arbeiten würde?', ['für', 'dich', 'arbeiten']],
    fr: ['Et si ton entreprise travaillait pour toi ?', ['travaillait', 'pour', 'toi']],
  },
  'A tua página. A tua app. A tua agenda.': {
    en: ['Your website. Your app. Your calendar.', ['website', 'app', 'calendar']],
    de: ['Deine Website. Deine App. Dein Kalender.', ['Website', 'App', 'Kalender']],
    fr: ['Ton site. Ton appli. Ton agenda.', ['site', 'appli', 'agenda']],
  },
  'Tudo ligado. Tudo controlado.': {
    en: ['All connected. All under control.', ['connected', 'control']],
    de: ['Alles verbunden. Alles im Griff.', ['verbunden', 'Griff']],
    fr: ['Tout connecté. Tout maîtrisé.', ['connecté', 'maîtrisé']],
  },
  'Marca a tua sessão': { en: 'Book your session', de: 'Buche deinen Termin', fr: 'Réserve ta séance' },
  'em 30 segundos.': { en: 'in 30 seconds.', de: 'in 30 Sekunden.', fr: 'en 30 secondes.' },
  'Escolhe o dia. Recebe a confirmação no telemóvel.': { en: 'Pick the day. Get the confirmation on your phone.', de: 'Wähle den Tag. Die Bestätigung kommt aufs Handy.', fr: 'Choisis le jour. Reçois la confirmation sur ton téléphone.' },
  'Marcar agora →': { en: 'Book now →', de: 'Jetzt buchen →', fr: 'Réserver →' },
  'Terça, 19': { en: 'Tuesday, 19', de: 'Dienstag, 19.', fr: 'Mardi 19' },
  'Marcações': { en: 'Bookings', de: 'Termine', fr: 'Rendez-vous' },
  'Sessão 60 min': { en: '60 min session', de: 'Sitzung 60 Min.', fr: 'Séance 60 min' },
  'Sessão 30 min': { en: '30 min session', de: 'Sitzung 30 Min.', fr: 'Séance 30 min' },
  'Primeira consulta': { en: 'First visit', de: 'Erstgespräch', fr: 'Première consultation' },
  'Avaliação': { en: 'Assessment', de: 'Beratung', fr: 'Bilan' },
  // Automação
  'Ligamos tudo com IA.': {
    en: ['We connect it all with AI.', ['AI']],
    de: ['Wir verbinden alles mit KI.', ['KI']],
    fr: ['On connecte tout avec l\'IA.', ['l\'IA']],
  },
  'Automação onde perdes tempo.': {
    en: ['Automation where you lose time.', ['lose', 'time']],
    de: ['Automatisierung, wo du Zeit verlierst.', ['Zeit', 'verlierst']],
    fr: ['L\'automatisation là où tu perds du temps.', ['perds', 'temps']],
  },
  'Responde a mensagens': { en: 'Answers messages', de: 'Beantwortet Nachrichten', fr: 'Répond aux messages' },
  'Dia e noite, no tom do teu negócio.': { en: 'Day and night, in your business\'s tone.', de: 'Tag und Nacht, im Ton deines Business.', fr: 'Jour et nuit, avec le ton de ton entreprise.' },
  'Marca e lembra': { en: 'Books and reminds', de: 'Bucht und erinnert', fr: 'Réserve et rappelle' },
  'Agenda própria com lembretes automáticos.': { en: 'Your own calendar with automatic reminders.', de: 'Eigener Kalender mit automatischen Erinnerungen.', fr: 'Ton propre agenda avec rappels automatiques.' },
  'Qualifica contactos': { en: 'Qualifies leads', de: 'Qualifiziert Kontakte', fr: 'Qualifie les contacts' },
  'Sabes quem está pronto para comprar.': { en: 'You know who\'s ready to buy.', de: 'Du weißt, wer bereit zum Kaufen ist.', fr: 'Tu sais qui est prêt à acheter.' },
  'Relatórios sozinhos': { en: 'Reports on their own', de: 'Berichte von selbst', fr: 'Rapports automatiques' },
  'Vês onde perdes tempo e dinheiro.': { en: 'See where you lose time and money.', de: 'Du siehst, wo du Zeit und Geld verlierst.', fr: 'Tu vois où tu perds temps et argent.' },
  'Faturação': { en: 'Invoicing', de: 'Rechnungen', fr: 'Facturation' },
  'Relatórios': { en: 'Reports', de: 'Berichte', fr: 'Rapports' },
  'Agenda': { en: 'Calendar', de: 'Kalender', fr: 'Agenda' },
  'IA': { en: 'AI', de: 'KI', fr: 'IA' },
  // Formação
  'Formamos a tua equipa em IA.': {
    en: ['We train your team in AI.', ['AI']],
    de: ['Wir schulen dein Team in KI.', ['KI']],
    fr: ['On forme ton équipe à l\'IA.', ['l\'IA']],
  },
  'Resume os pedidos de hoje e prepara as respostas.': { en: 'Summarise today\'s requests and draft the replies.', de: 'Fasse die heutigen Anfragen zusammen und bereite die Antworten vor.', fr: 'Résume les demandes du jour et prépare les réponses.' },
  'Receção': { en: 'Front desk', de: 'Empfang', fr: 'Accueil' },
  'Vendas': { en: 'Sales', de: 'Vertrieb', fr: 'Ventes' },
  'Gestão': { en: 'Management', de: 'Leitung', fr: 'Gestion' },
  'Operações': { en: 'Operations', de: 'Betrieb', fr: 'Opérations' },
  'Assistente da equipa': { en: 'Team assistant', de: 'Team-Assistent', fr: 'Assistant d\'équipe' },
  '12 pedidos novos: 7 marcações, 3 orçamentos, 2 dúvidas.': { en: '12 new requests: 7 bookings, 3 quotes, 2 questions.', de: '12 neue Anfragen: 7 Termine, 3 Angebote, 2 Fragen.', fr: '12 nouvelles demandes : 7 rendez-vous, 3 devis, 2 questions.' },
  'Respostas prontas a enviar, no tom da casa.': { en: 'Replies ready to send, in your house style.', de: 'Antworten versandbereit, im Ton des Hauses.', fr: 'Réponses prêtes à envoyer, dans le ton de la maison.' },
  'Dois clientes para ligar ainda hoje.': { en: 'Two clients to call back today.', de: 'Zwei Kunden heute noch zurückrufen.', fr: 'Deux clients à rappeler aujourd\'hui.' },
  'Exemplo ilustrativo': { en: 'Illustrative example', de: 'Beispiel zur Veranschaulichung', fr: 'Exemple illustratif' },
  'Formação concluída ✓': { en: 'Training complete ✓', de: 'Schulung abgeschlossen ✓', fr: 'Formation terminée ✓' },
  'Em formação': { en: 'In training', de: 'In Schulung', fr: 'En formation' },
  'Menos tarefas repetidas. Mais tempo para o que importa.': {
    en: ['Fewer repetitive tasks. More time for what matters.', ['matters']],
    de: ['Weniger Routinearbeit. Mehr Zeit für das Wesentliche.', ['Wesentliche']],
    fr: ['Moins de tâches répétitives. Plus de temps pour l\'essentiel.', ['l\'essentiel']],
  },
  'SEG TER QUA QUI SEX SÁB': { en: 'MON TUE WED THU FRI SAT', de: 'MO DI MI DO FR SA', fr: 'LUN MAR MER JEU VEN SAM' },
  // Liberdade
  'Mais tempo.': { en: 'More time.', de: 'Mehr Zeit.', fr: 'Plus de temps.' },
  'Mais liberdade.': { en: ['More freedom.', ['freedom']], de: ['Mehr Freiheit.', ['Freiheit']], fr: ['Plus de liberté.', ['liberté']] },
  'Mais do que dinheiro.': { en: ['More than money.', ['money']], de: ['Mehr als Geld.', ['Geld']], fr: ['Plus que l\'argent.', ['l\'argent']] },
  // CTA
  'IA · Automação · Formação': { en: 'AI · Automation · Training', de: 'KI · Automatisierung · Schulung', fr: 'IA · Automatisation · Formation' },
  'Marca o teu diagnóstico': { en: 'Book your diagnosis', de: 'Buche deine Analyse', fr: 'Réserve ton diagnostic' },
  'More Than Money · Soluções de IA para pequenos negócios': { en: 'More Than Money · AI solutions for small businesses', de: 'More Than Money · KI-Lösungen für kleine Unternehmen', fr: 'More Than Money · Solutions IA pour les petites entreprises' },
}

/** Texto simples traduzido (cai no PT se faltar). */
export const t = (pt: string): string => {
  const l = idioma(); if (l === 'pt') return pt
  const e = D[pt]?.[l]; return e === undefined ? pt : typeof e === 'string' ? e : e[0]
}
/** Título com destaque: devolve {texto, destaque} para espalhar no <Titulo>. */
export const tt = (pt: string, destaque: string[] = [], size = 120): { texto: string; destaque: string[]; size: number } => {
  const l = idioma(); const e = l === 'pt' ? undefined : D[pt]?.[l]
  if (e === undefined) return { texto: pt, destaque, size }
  const [texto, d] = typeof e === 'string' ? [e, [] as string[]] : e
  // texto mais comprido do que o PT encolhe na mesma proporção, para não tocar nas bordas
  return { texto, destaque: d, size: Math.round(size * Math.min(1, (pt.length + 2) / texto.length)) }
}
