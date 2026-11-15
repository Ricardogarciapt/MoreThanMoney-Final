// Junta as simulações das landings (components/scanner/sim) num só ficheiro para o cenas.html.
// Gerar: npx esbuild video/bootcamp/sim/entrada.js --bundle --minify --format=iife --outfile=video/bootcamp/sim/sim-bundle.js
import { simulate, scannerCards, SIM_SLUGS } from '../../../components/scanner/sim/scanner-sim.js'
import { createScannerScene } from '../../../components/scanner/sim/scanner-3d.js'
import { drawCard } from '../../../components/scanner/sim/scanner-2d.js'
import { CARD_TEXT_EN } from '../../../components/scanner/sim/i18n.js'
window.SIMMTM = { simulate, scannerCards, SIM_SLUGS, createScannerScene, drawCard, CARD_TEXT_EN }
