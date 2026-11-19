import React from 'react'
import { Composition } from 'remotion'
import { Video as Solucoes } from './projetos/solucoes/Video'
import { TOTAL as TOTAL_SOLUCOES } from './projetos/solucoes/tempo'
import { Video as LandingRicardo } from './projetos/landing-ricardo/Video'
import { TOTAL as TOTAL_LANDING_RICARDO } from './projetos/landing-ricardo/tempo'
import { FPS, formatoPedido } from './motor/marca'

// Cada projecto (guião + cenas) regista aqui a sua composição. O motor (src/motor) e a marca são comuns.
export const Root: React.FC = () => (
  <>
    <Composition id="Solucoes" component={Solucoes} durationInFrames={TOTAL_SOLUCOES} fps={FPS} {...formatoPedido('youtube')} />
    <Composition id="LandingRicardo" component={LandingRicardo} durationInFrames={TOTAL_LANDING_RICARDO} fps={FPS} {...formatoPedido('youtube')} />
  </>
)
