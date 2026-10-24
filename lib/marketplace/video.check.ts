/** npx tsx lib/marketplace/video.check.ts */
import { comoMostrarVideo, videoParaGravar } from './video'

let f = 0
const certo = (c: boolean, o: string) => { if (!c) { f++; console.error('  ✗ ' + o) } }

// A gravação: vazio apaga, só https entra.
certo(videoParaGravar('').ok && (videoParaGravar('') as { url: null }).url === null, 'vazio = sem vídeo')
certo(!videoParaGravar('http://x/v.mp4').ok, 'http não entra')
certo(!videoParaGravar('javascript:alert(1)').ok, 'javascript: não entra')
certo(!videoParaGravar('não é url').ok, 'lixo não entra')
certo(videoParaGravar(' https://x/v.mp4 ').ok, 'https entra')

// A ficha: YouTube vira embed, o resto vai para o <video>.
const yt = comoMostrarVideo('https://youtu.be/xZvP6x37M-k')
certo(yt?.tipo === 'youtube' && yt.embed.includes('/embed/xZvP6x37M-k'), 'YouTube → embed')
const mp4 = comoMostrarVideo('https://cdn.x/apresentacao.mp4')
certo(mp4?.tipo === 'ficheiro' && mp4.url === 'https://cdn.x/apresentacao.mp4', 'mp4 → <video>')
certo(comoMostrarVideo(null) === null, 'sem vídeo não desenha nada')
certo(comoMostrarVideo('http://x/v.mp4') === null, 'um link gravado à mão em http não chega à ficha')

if (f) { console.error(`marketplace/video: ${f} falha(s)`); process.exit(1) }
console.log('marketplace/video: só https entra, YouTube vira embed e mp4 vai para o <video> ✓')
