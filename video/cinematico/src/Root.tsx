import React from 'react'
import { Composition } from 'remotion'
import { Video as Solucoes } from './projetos/solucoes/Video'
import { TOTAL as TOTAL_SOLUCOES } from './projetos/solucoes/tempo'
import { Video as LandingRicardo } from './projetos/landing-ricardo/Video'
import { TOTAL as TOTAL_LANDING_RICARDO } from './projetos/landing-ricardo/tempo'
import { Video as AnuncioReel } from './projetos/anuncio-reel/Video'
import { duracao as duracaoAnuncio } from './projetos/anuncio-reel/anuncios'
import { FPS, formatoPedido } from './motor/marca'

// Cada projecto (guião + cenas) regista aqui a sua composição. O motor (src/motor) e a marca são comuns.
export const Root: React.FC = () => (
  <>
    <Composition id="Solucoes" component={Solucoes} durationInFrames={TOTAL_SOLUCOES} fps={FPS} {...formatoPedido('youtube')} />
    <Composition id="LandingRicardo" component={LandingRicardo} durationInFrames={TOTAL_LANDING_RICARDO} fps={FPS} {...formatoPedido('youtube')} />
    <Composition id="AnuncioReel" component={AnuncioReel} durationInFrames={300} fps={FPS} width={1080} height={1920}
      calculateMetadata={({ props }) => ({ durationInFrames: Math.round(duracaoAnuncio(String((props as { anuncio?: string }).anuncio || 'cor'), props as never) * FPS) })} />
  </>
)
