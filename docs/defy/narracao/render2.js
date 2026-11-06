const { chromium } = require('playwright')
const lang = process.argv[2], dir = process.argv[3], plan = JSON.parse(process.argv[4])
const warp = (T) => { const { outK, inK } = plan; for (let i = 0; i < 4; i++) if (T <= outK[i+1]) return inK[i] + (T - outK[i]) / (outK[i+1] - outK[i]) * (inK[i+1] - inK[i]); return 33.5 }
;(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  p.on('pageerror', e => console.log('ERR', e.message))
  await p.goto('file://' + __dirname + '/index.html?lang=' + lang)
  await p.waitForFunction('window.ready'); await p.evaluate(() => document.fonts.ready)
  const N = Math.round(plan.total * 30)
  for (let n = 0; n < N; n++) {
    await p.evaluate((t) => window.setT(t), warp(n / 30))
    await p.screenshot({ path: `${dir}/f${String(n).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 })
  }
  await b.close(); console.log('frames', N)
})()
