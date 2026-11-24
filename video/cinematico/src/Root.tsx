import React from 'react'
import { Composition } from 'remotion'
import { Video as Solucoes } from './projetos/solucoes/Video'
import { TOTAL as TOTAL_SOLUCOES } from './projetos/solucoes/tempo'
import { Video as LandingRicardo } from './projetos/landing-ricardo/Video'
import { TOTAL as TOTAL_LANDING_RICARDO } from './projetos/landing-ricardo/tempo'
import { Video as AnuncioReel } from './projetos/anuncio-reel/Video'
import { duracao as duracaoAnuncio } from './projetos/anuncio-reel/anuncios'
import { FPS, formatoPedido } from './motor/marca'
import { Video as FastStartV1 } from './projetos/fast-start-forex/Video'
import { TOTAL as TOTAL_FAST_V1 } from './projetos/fast-start-forex/cenas'
import { VideoCenas as FastStartCenas } from './projetos/fast-start-forex/Video'
import { LICAO2, LICAO3, LICAO4 } from './projetos/fast-start-forex/licoes'
const tot = (c: { dur: number }[]) => c.reduce((a, x) => a + x.dur, 0)

// Cada projecto (guião + cenas) regista aqui a sua composição. O motor (src/motor) e a marca são comuns.
export const Root: React.FC = () => (
  <>
    <Composition id="FastStartL2" component={() => <FastStartCenas cenas={LICAO2} bloco="Lição 2" />} durationInFrames={tot(LICAO2)} fps={FPS} {...formatoPedido('youtube')} />
    <Composition id="FastStartL3" component={() => <FastStartCenas cenas={LICAO3} bloco="Lição 3" />} durationInFrames={tot(LICAO3)} fps={FPS} {...formatoPedido('youtube')} />
    <Composition id="FastStartL4" component={() => <FastStartCenas cenas={LICAO4} bloco="Lição 4" />} durationInFrames={tot(LICAO4)} fps={FPS} {...formatoPedido('youtube')} />
    <Composition id="FastStartV1" component={FastStartV1} durationInFrames={TOTAL_FAST_V1} fps={FPS} {...formatoPedido('youtube')} />
    <Composition id="Solucoes" component={Solucoes} durationInFrames={TOTAL_SOLUCOES} fps={FPS} {...formatoPedido('youtube')} />
    <Composition id="LandingRicardo" component={LandingRicardo} durationInFrames={TOTAL_LANDING_RICARDO} fps={FPS} {...formatoPedido('youtube')} />
    <Composition id="AnuncioReel" component={AnuncioReel} durationInFrames={300} fps={FPS} width={1080} height={1920}
      calculateMetadata={({ props }) => ({ durationInFrames: Math.round(duracaoAnuncio(String((props as { anuncio?: string }).anuncio || 'cor'), props as never) * FPS) })} />
  </>
)
