import React from 'react'
import { AbsoluteFill, Sequence } from 'remotion'
import { LightLeak } from '@remotion/light-leaks'
import { CENAS, FUNDO } from './tempo'
import { Pelicula, Clarao } from '../../motor/util'
import { Relogio } from './cenas/Relogio'
import { Caos } from './cenas/Caos'
import { Transforma } from './cenas/Transforma'
import { Automacao } from './cenas/Automacao'
import { Formacao } from './cenas/Formacao'
import { Liberdade } from './cenas/Liberdade'
import { Cta } from './cenas/Cta'

import { FONTES_CSS } from '../../motor/marca'
const fontes = FONTES_CSS

export const Video: React.FC = () => (
  <AbsoluteFill style={{ background: FUNDO }}>
    <style>{fontes}</style>
    <Sequence {...s('relogio')}><Relogio /></Sequence>
    <Sequence {...s('caos')}><Caos /></Sequence>
    <Sequence {...s('transforma')}><Transforma /></Sequence>
    <Sequence {...s('automacao')}><Automacao /></Sequence>
    <Sequence {...s('formacao')}><Formacao /></Sequence>
    <Sequence {...s('liberdade')}><Liberdade /></Sequence>
    <Sequence {...s('cta')}><Cta /></Sequence>
    {[CENAS.caos.de, CENAS.transforma.de, CENAS.automacao.de, CENAS.formacao.de, CENAS.liberdade.de, CENAS.cta.de].map((c) => (
      <Clarao key={c} em={c} />
    ))}
    <Sequence from={CENAS.transforma.de - 10} durationInFrames={50}><LightLeak durationInFrames={50} seed={3} hueShift={20} /></Sequence>
    <Sequence from={CENAS.liberdade.de - 10} durationInFrames={60}><LightLeak durationInFrames={60} seed={7} hueShift={15} /></Sequence>
    <Sequence from={CENAS.cta.de - 15} durationInFrames={50}><LightLeak durationInFrames={50} seed={1} hueShift={20} /></Sequence>
    <Pelicula />
  </AbsoluteFill>
)

function s(k: keyof typeof CENAS) { return { from: CENAS[k].de, durationInFrames: CENAS[k].dur } }
