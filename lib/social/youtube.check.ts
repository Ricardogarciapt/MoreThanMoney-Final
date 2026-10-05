/** npx tsx lib/social/youtube.check.ts */
import { youtubeId, previewDoYoutube } from "./youtube"
let f = 0; const certo = (c: boolean, o: string) => { if (!c) { f++; console.error("  ✗ " + o) } }
certo(youtubeId("https://www.youtube.com/watch?v=xZvP6x37M-k") === "xZvP6x37M-k", "watch?v=")
certo(youtubeId("https://youtu.be/xZvP6x37M-k?si=abc") === "xZvP6x37M-k", "youtu.be")
certo(youtubeId("https://www.youtube.com/shorts/abcdefghijk") === "abcdefghijk", "shorts")
certo(youtubeId("https://m.youtube.com/watch?v=abcdefghijk&t=10") === "abcdefghijk", "m.youtube")
certo(youtubeId("https://www.morethanmoney.pt/?v=abcdefghijk") === null, "outro site não é YouTube")
certo(youtubeId("não é url") === null, "lixo → null")
const p = previewDoYoutube("https://youtu.be/xZvP6x37M-k", "xZvP6x37M-k", null)
certo(p.image === "https://img.youtube.com/vi/xZvP6x37M-k/hqdefault.jpg" && p.siteName === "YouTube" && p.title === "Vídeo no YouTube", "sem oEmbed: thumbnail pelo id")
const q = previewDoYoutube("u", "xZvP6x37M-k", { title: "Liderança", author_name: "Work Talks", thumbnail_url: "https://i.ytimg.com/x.jpg" })
certo(q.title === "Liderança" && q.description === "Work Talks" && q.image === "https://i.ytimg.com/x.jpg", "com oEmbed: título, autor e imagem")
if (f) { console.error(`youtube: ${f} falha(s)`); process.exit(1) }
console.log("youtube: a pré-visualização de um vídeo tem título e thumbnail, nunca «youtube.com / youtube.com» ✓")
