import { I18N_LANGS, type Lang } from "../config"

/**
 * O aviso fixo da conta no WebTrader (lib/mtmfunded/aviso-conta.ts), nos 21 idiomas.
 *
 * Em ficheiro à parte do resto do MTM Funded (que só tem PT/EN) porque esta linha está SEMPRE à
 * vista em todo o WebTrader — é a única peça do produto que ninguém pode ler na língua errada.
 *
 * As frases montam-se de peças por idioma: assim as nove variantes (e as versões curtas da faixa
 * do telemóvel) ficam coerentes entre si, e acrescentar um idioma é preencher uma linha.
 * «MTM Funded» e «Funded» não se traduzem (nome do produto).
 */

interface Pecas {
  sim: string // conta simulada educativa
  simC: string // conta simulada
  aval: string // encontras-te em avaliação
  avalC: string
  concl: string // avaliação concluída (desafio aprovado)
  term: string // avaliação terminada (quebrado/cancelado/expirado)
  conta: string
  real: string // contém negociação real
  fundedC: string // conta Funded
  enc: string // encerrada, já não negoceia
  encC: string
  an: string // conta de análise, não é negociação real
  anC: string
  torneio: string
  mestre: string // conta-mestre de estratégia
  mestreC: string
}

const P: Record<Lang, Pecas> = {
  pt: { sim: "Conta simulada educativa", simC: "Conta simulada", aval: "Encontras-te em Avaliação", avalC: "Em Avaliação", concl: "Avaliação concluída", term: "Avaliação terminada", conta: "Conta", real: "contém negociação real", fundedC: "Conta Funded", enc: "encerrada, já não negoceia", encC: "encerrada", an: "Conta de análise, não é negociação real", anC: "análise, não é negociação real", torneio: "Torneio", mestre: "Conta-mestre de estratégia", mestreC: "conta-mestre" },
  en: { sim: "Educational simulated account", simC: "Simulated account", aval: "You are in Evaluation", avalC: "In Evaluation", concl: "Evaluation completed", term: "Evaluation ended", conta: "Account", real: "contains real trading", fundedC: "Funded account", enc: "closed, no longer trading", encC: "closed", an: "Analysis account, not real trading", anC: "analysis, not real trading", torneio: "Tournament", mestre: "Strategy master account", mestreC: "master account" },
  es: { sim: "Cuenta simulada educativa", simC: "Cuenta simulada", aval: "Estás en Evaluación", avalC: "En Evaluación", concl: "Evaluación completada", term: "Evaluación terminada", conta: "Cuenta", real: "contiene operativa real", fundedC: "Cuenta Funded", enc: "cerrada, ya no opera", encC: "cerrada", an: "Cuenta de análisis, no es operativa real", anC: "análisis, no es operativa real", torneio: "Torneo", mestre: "Cuenta maestra de estrategia", mestreC: "cuenta maestra" },
  fr: { sim: "Compte simulé éducatif", simC: "Compte simulé", aval: "Vous êtes en Évaluation", avalC: "En Évaluation", concl: "Évaluation réussie", term: "Évaluation arrêtée", conta: "Compte", real: "contient du trading réel", fundedC: "Compte Funded", enc: "clôturé, ne trade plus", encC: "clôturé", an: "Compte d'analyse, pas de trading réel", anC: "analyse, pas de trading réel", torneio: "Tournoi", mestre: "Compte maître de stratégie", mestreC: "compte maître" },
  de: { sim: "Pädagogisches Simulationskonto", simC: "Simulationskonto", aval: "Du befindest dich in der Evaluierung", avalC: "In Evaluierung", concl: "Evaluierung abgeschlossen", term: "Evaluierung beendet", conta: "Konto", real: "enthält echten Handel", fundedC: "Funded-Konto", enc: "geschlossen, kein Handel mehr", encC: "geschlossen", an: "Analysekonto, kein echter Handel", anC: "Analyse, kein echter Handel", torneio: "Turnier", mestre: "Strategie-Masterkonto", mestreC: "Masterkonto" },
  it: { sim: "Conto simulato educativo", simC: "Conto simulato", aval: "Sei in Valutazione", avalC: "In Valutazione", concl: "Valutazione completata", term: "Valutazione terminata", conta: "Conto", real: "contiene trading reale", fundedC: "Conto Funded", enc: "chiuso, non opera più", encC: "chiuso", an: "Conto di analisi, non è trading reale", anC: "analisi, non è trading reale", torneio: "Torneo", mestre: "Conto master della strategia", mestreC: "conto master" },
  nl: { sim: "Educatieve simulatierekening", simC: "Simulatierekening", aval: "Je zit in de Evaluatie", avalC: "In Evaluatie", concl: "Evaluatie voltooid", term: "Evaluatie beëindigd", conta: "Rekening", real: "bevat echte handel", fundedC: "Funded-rekening", enc: "gesloten, handelt niet meer", encC: "gesloten", an: "Analyserekening, geen echte handel", anC: "analyse, geen echte handel", torneio: "Toernooi", mestre: "Masterrekening van strategie", mestreC: "masterrekening" },
  "zh-CN": { sim: "教育模拟账户", simC: "模拟账户", aval: "您正处于评估阶段", avalC: "评估中", concl: "评估已完成", term: "评估已结束", conta: "账户", real: "包含真实交易", fundedC: "Funded 账户", enc: "已关闭，不再交易", encC: "已关闭", an: "分析账户，非真实交易", anC: "分析，非真实交易", torneio: "比赛", mestre: "策略主账户", mestreC: "主账户" },
  ja: { sim: "教育用シミュレーション口座", simC: "シミュレーション口座", aval: "現在評価中です", avalC: "評価中", concl: "評価完了", term: "評価終了", conta: "口座", real: "実際の取引を含みます", fundedC: "Funded 口座", enc: "終了済み・取引不可", encC: "終了済み", an: "分析用口座・実際の取引ではありません", anC: "分析用・実際の取引ではありません", torneio: "トーナメント", mestre: "戦略マスター口座", mestreC: "マスター口座" },
  ar: { sim: "حساب تجريبي تعليمي", simC: "حساب تجريبي", aval: "أنت في مرحلة التقييم", avalC: "قيد التقييم", concl: "اكتمل التقييم", term: "انتهى التقييم", conta: "حساب", real: "يتضمن تداولًا حقيقيًا", fundedC: "حساب Funded", enc: "مغلق، لم يعد يتداول", encC: "مغلق", an: "حساب تحليل، ليس تداولًا حقيقيًا", anC: "تحليل، ليس تداولًا حقيقيًا", torneio: "بطولة", mestre: "الحساب الرئيسي للاستراتيجية", mestreC: "حساب رئيسي" },
  ru: { sim: "Учебный симулированный счёт", simC: "Симулированный счёт", aval: "Вы проходите оценку", avalC: "На оценке", concl: "Оценка завершена", term: "Оценка прекращена", conta: "Счёт", real: "содержит реальную торговлю", fundedC: "Счёт Funded", enc: "закрыт, торговля прекращена", encC: "закрыт", an: "Аналитический счёт, не реальная торговля", anC: "анализ, не реальная торговля", torneio: "Турнир", mestre: "Мастер-счёт стратегии", mestreC: "мастер-счёт" },
  hi: { sim: "शैक्षिक सिम्युलेटेड खाता", simC: "सिम्युलेटेड खाता", aval: "आप मूल्यांकन में हैं", avalC: "मूल्यांकन में", concl: "मूल्यांकन पूरा हुआ", term: "मूल्यांकन समाप्त", conta: "खाता", real: "इसमें वास्तविक ट्रेडिंग है", fundedC: "Funded खाता", enc: "बंद, अब ट्रेडिंग नहीं", encC: "बंद", an: "विश्लेषण खाता, वास्तविक ट्रेडिंग नहीं", anC: "विश्लेषण, वास्तविक ट्रेडिंग नहीं", torneio: "टूर्नामेंट", mestre: "रणनीति मास्टर खाता", mestreC: "मास्टर खाता" },
  sr: { sim: "Edukativni simulirani račun", simC: "Simulirani račun", aval: "Nalaziš se u Evaluaciji", avalC: "U Evaluaciji", concl: "Evaluacija završena", term: "Evaluacija prekinuta", conta: "Račun", real: "sadrži stvarno trgovanje", fundedC: "Funded račun", enc: "zatvoren, više ne trguje", encC: "zatvoren", an: "Račun za analizu, nije stvarno trgovanje", anC: "analiza, nije stvarno trgovanje", torneio: "Turnir", mestre: "Glavni račun strategije", mestreC: "glavni račun" },
  hr: { sim: "Edukativni simulirani račun", simC: "Simulirani račun", aval: "Nalaziš se u Evaluaciji", avalC: "U Evaluaciji", concl: "Evaluacija završena", term: "Evaluacija prekinuta", conta: "Račun", real: "sadrži stvarno trgovanje", fundedC: "Funded račun", enc: "zatvoren, više ne trguje", encC: "zatvoren", an: "Račun za analizu, nije stvarno trgovanje", anC: "analiza, nije stvarno trgovanje", torneio: "Turnir", mestre: "Glavni račun strategije", mestreC: "glavni račun" },
  bs: { sim: "Edukativni simulirani račun", simC: "Simulirani račun", aval: "Nalaziš se u Evaluaciji", avalC: "U Evaluaciji", concl: "Evaluacija završena", term: "Evaluacija prekinuta", conta: "Račun", real: "sadrži stvarno trgovanje", fundedC: "Funded račun", enc: "zatvoren, više ne trguje", encC: "zatvoren", an: "Račun za analizu, nije stvarno trgovanje", anC: "analiza, nije stvarno trgovanje", torneio: "Turnir", mestre: "Glavni račun strategije", mestreC: "glavni račun" },
  sq: { sim: "Llogari simuluese edukative", simC: "Llogari simuluese", aval: "Je në Vlerësim", avalC: "Në Vlerësim", concl: "Vlerësimi u përfundua", term: "Vlerësimi u ndërpre", conta: "Llogari", real: "përmban tregtim real", fundedC: "Llogari Funded", enc: "e mbyllur, nuk tregton më", encC: "e mbyllur", an: "Llogari analize, jo tregtim real", anC: "analizë, jo tregtim real", torneio: "Turne", mestre: "Llogaria kryesore e strategjisë", mestreC: "llogari kryesore" },
  bg: { sim: "Образователна симулирана сметка", simC: "Симулирана сметка", aval: "В процес на оценяване си", avalC: "В оценяване", concl: "Оценяването е завършено", term: "Оценяването е прекратено", conta: "Сметка", real: "съдържа реална търговия", fundedC: "Funded сметка", enc: "закрита, вече не търгува", encC: "закрита", an: "Аналитична сметка, не е реална търговия", anC: "анализ, не е реална търговия", torneio: "Турнир", mestre: "Главна сметка на стратегия", mestreC: "главна сметка" },
  ro: { sim: "Cont simulat educațional", simC: "Cont simulat", aval: "Ești în Evaluare", avalC: "În Evaluare", concl: "Evaluare finalizată", term: "Evaluare încheiată", conta: "Cont", real: "conține tranzacționare reală", fundedC: "Cont Funded", enc: "închis, nu mai tranzacționează", encC: "închis", an: "Cont de analiză, nu este tranzacționare reală", anC: "analiză, nu este tranzacționare reală", torneio: "Turneu", mestre: "Cont master al strategiei", mestreC: "cont master" },
  pl: { sim: "Edukacyjne konto symulowane", simC: "Konto symulowane", aval: "Jesteś w trakcie Oceny", avalC: "W trakcie Oceny", concl: "Ocena zakończona", term: "Ocena przerwana", conta: "Konto", real: "zawiera prawdziwy handel", fundedC: "Konto Funded", enc: "zamknięte, nie handluje", encC: "zamknięte", an: "Konto analityczne, to nie prawdziwy handel", anC: "analiza, to nie prawdziwy handel", torneio: "Turniej", mestre: "Konto główne strategii", mestreC: "konto główne" },
  uk: { sim: "Навчальний симульований рахунок", simC: "Симульований рахунок", aval: "Ви проходите оцінювання", avalC: "На оцінюванні", concl: "Оцінювання завершено", term: "Оцінювання припинено", conta: "Рахунок", real: "містить реальну торгівлю", fundedC: "Рахунок Funded", enc: "закритий, торгівля припинена", encC: "закритий", an: "Аналітичний рахунок, не реальна торгівля", anC: "аналіз, не реальна торгівля", torneio: "Турнір", mestre: "Майстер-рахунок стратегії", mestreC: "майстер-рахунок" },
  tr: { sim: "Eğitim amaçlı simülasyon hesabı", simC: "Simülasyon hesabı", aval: "Değerlendirmedesin", avalC: "Değerlendirmede", concl: "Değerlendirme tamamlandı", term: "Değerlendirme sona erdi", conta: "Hesap", real: "gerçek işlem içerir", fundedC: "Funded hesabı", enc: "kapatıldı, artık işlem yapmıyor", encC: "kapatıldı", an: "Analiz hesabı, gerçek işlem değil", anC: "analiz, gerçek işlem değil", torneio: "Turnuva", mestre: "Strateji ana hesabı", mestreC: "ana hesap" },
}

const F = "MTM Funded"

export function frasesDoAviso(p: Pecas): Record<string, string> {
  const k = (n: string) => `mtmfunded.aviso.${n}`
  return {
    [k("avaliacao")]: `${p.sim} · ${F} · ${p.aval}`,
    [k("avaliacao.curto")]: `${p.sim} · ${p.avalC}`,
    [k("avaliacao_concluida")]: `${p.sim} · ${F} · ${p.concl}`,
    [k("avaliacao_concluida.curto")]: `${p.simC} · ${p.concl}`,
    [k("avaliacao_terminada")]: `${p.sim} · ${F} · ${p.term}`,
    [k("avaliacao_terminada.curto")]: `${p.simC} · ${p.term}`,
    [k("funded")]: `${p.conta} · ${F} · ${p.real}`,
    [k("funded.curto")]: `${p.fundedC} · ${p.real}`,
    [k("funded_encerrada")]: `${p.conta} · ${F} · ${p.enc}`,
    [k("funded_encerrada.curto")]: `${p.fundedC} · ${p.encC}`,
    [k("analise")]: `${p.sim} · ${F} · ${p.an}`,
    [k("analise.curto")]: `${p.simC} · ${p.anC}`,
    [k("torneio")]: `${p.sim} · ${F} · ${p.torneio}`,
    [k("torneio.curto")]: `${p.simC} · ${p.torneio}`,
    [k("mestre")]: `${p.simC} · ${F} · ${p.mestre}`,
    [k("mestre.curto")]: `${p.simC} · ${p.mestreC}`,
    [k("geral")]: `${p.sim} · ${F}`,
    [k("geral.curto")]: p.sim,
  }
}

export const MTMFUNDED_AVISO_MESSAGES: Partial<Record<Lang, Record<string, string>>> = Object.fromEntries(
  I18N_LANGS.map((l) => [l, frasesDoAviso(P[l])]),
)
