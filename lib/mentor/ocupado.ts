/**
 * O que o membro vê quando TODA a IA grátis falhou (19/11/2026). Uma frase calma, na língua da
 * app, sem fornecedores, quotas nem identificadores — esse detalhe vai para os logs e o dono.
 */
const FRASES: Record<string, string> = {
  pt: "Estou com muita procura neste momento 😅 Dá-me um minuto e volta a enviar a tua mensagem, que eu respondo.",
  en: "I'm getting a lot of messages right now 😅 Give me a minute and send your message again — I'll answer.",
  es: "Ahora mismo tengo mucha demanda 😅 Dame un minuto y vuelve a enviar tu mensaje, que te respondo.",
  fr: "Je reçois beaucoup de messages en ce moment 😅 Laisse-moi une minute et renvoie ton message, je te réponds.",
  de: "Gerade schreiben mir sehr viele 😅 Gib mir eine Minute und schick deine Nachricht noch einmal – ich antworte.",
  it: "In questo momento ho molte richieste 😅 Dammi un minuto e rimanda il tuo messaggio, ti rispondo.",
  nl: "Ik krijg nu heel veel berichten 😅 Geef me een minuutje en stuur je bericht opnieuw, dan antwoord ik.",
  pl: "Mam teraz dużo wiadomości 😅 Daj mi minutę i wyślij wiadomość jeszcze raz — odpowiem.",
  ro: "Am foarte multe mesaje acum 😅 Dă-mi un minut și trimite din nou mesajul, îți răspund.",
  ru: "Сейчас очень много сообщений 😅 Дай мне минуту и отправь сообщение ещё раз — я отвечу.",
  uk: "Зараз дуже багато повідомлень 😅 Дай мені хвилинку й надішли повідомлення ще раз — я відповім.",
  tr: "Şu an çok fazla mesaj alıyorum 😅 Bana bir dakika ver ve mesajını tekrar gönder, cevaplayacağım.",
}

export function avisoOcupado(lang: string): string {
  return FRASES[lang] ?? FRASES[lang.slice(0, 2)] ?? FRASES.en
}
