// Calcula o mapa de tempo (vídeo esticado à narração) e os offsets dos áudios.
const { execFileSync } = require('child_process')
const lang = process.argv[2]
const R = '/home/user/MoreThanMoney-Final/docs/defy/narracao/landing-' + lang
const d = [1,2,3,4,5,6,7].map(i => Number(execFileSync('ffprobe', ['-v','error','-show_entries','format=duration','-of','csv=p=0', `${R}/0${i}.mp3`]).toString()))
const G = 0.45
const A = 0.5 + d[0] + 0.4, B = d[1] + G + d[2] + 0.5, C = d[3] + G + d[4] + 0.5, D = d[5] + G + d[6] + 1.2
const outK = [0, A, A + B, A + B + C, A + B + C + D]
const inK = [0, 3.0, 16.0, 28.5, 33.5]
const off = [0.5, A, A + d[1] + G, A + B, A + B + d[3] + G, A + B + C, A + B + C + d[5] + G]
console.log(JSON.stringify({ outK, inK, off, total: outK[4], files: [1,2,3,4,5,6,7].map(i => `${R}/0${i}.mp3`) }))
