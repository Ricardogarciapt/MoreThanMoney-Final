# Riesgo: el chaleco

> No se controla lo que hace el mercado. Se controla cuánto de ti queda expuesto en cada decisión.

Hay un tipo de chaleco que nadie quiere ponerse, porque no es bonito y no promete nada. Es el chaleco que aguanta el impacto cuando todo lo demás falla. En la gestión del riesgo, el chaleco es la regla que te impide salir del juego después de una mala racha.

Es muy habitual ver a quien empieza dedicar horas a encontrar la entrada perfecta y cinco minutos a decidir el tamaño de la posición. Ese es el error. El tamaño de la posición es la decisión que más pesa en tu cuenta, y es la que más se ignora.

:::destaque
Antes de preguntarte cuánto puedes ganar, pregúntate cuánto estás dispuesto a perder en una sola operación, y escribe el número.
:::

## La regla del 1 %

La regla que defiendo en esta casa es sencilla: no arriesgar más del 1 % del capital en una misma operación. Parece conservadora. Lo es. Y precisamente por eso aguanta.

Ejemplo ilustrativo, con cifras redondas y cuenta en dólares para simplificar: una cuenta de 2.000 $. Un 1 % son 20 $. Eso significa que, si la operación sale mal y toca el stop-loss, pierdes 20 $ y nada más. No 200 $, ni «lo que faltaba para recuperar».


:::curso Lección 306 · Qué es un stop loss
El stop loss es la orden que cierra la posición automáticamente si el precio va en tu contra hasta un punto que elegiste antes de entrar.

- Se define **antes** de entrar, nunca después.
- Se coloca donde tu idea deja de tener sentido, no donde «duele menos».
- No se aleja cuando el precio se acerca. Ese es el error más caro que conozco.

en el curso: marcas stops en veinte gráficos antiguos y comparas con los de un compañero. La diferencia entre los dos enseña más que cualquier diapositiva.
:::

## La fórmula del tamaño de la posición

El tamaño de la posición une tres cosas: el riesgo que aceptas, la distancia del stop y el valor de cada pip. La fórmula es esta:

**Tamaño (en lotes) = Riesgo en dinero ÷ (Distancia del stop en pips × Valor del pip por lote)**

Vamos por partes, con el ejemplo de la cuenta de 2.000 $:

| Paso | Cálculo | Resultado |
|---|---|---|
| 1. Riesgo en dinero | 1 % de 2.000 $ | 20 $ |
| 2. Distancia del stop | Definida antes de entrar, por ejemplo | 25 pips en EUR/USD |
| 3. Valor del pip por lote estándar | En EUR/USD, con cuenta en dólares | unos 10 $ |
| 4. Valor de riesgo por lote | 25 pips × 10 $ | 250 $ |
| 5. Tamaño de la posición | 20 $ ÷ 250 $ | 0,08 lotes |

O sea, 0,08 lotes, que es lo mismo que 8 microlotes (cada microlote es 0,01 de lote). Compruébalo: si el precio alcanza el stop de 25 pips, la pérdida es 25 × (0,08 × 10 $) = 25 × 0,80 $ = 20 $. Cuadra con el riesgo que definiste.

:::alerta
Si el stop es más ancho, el tamaño de la posición tiene que ser menor, no mayor. Mucha gente hace lo contrario: aprieta el stop para que quepa un lote grande. Eso deja la cuenta a merced del primer ruido del mercado.
:::

Nota honesta: el valor del pip de un par depende de la moneda de la cuenta y del cambio del día. Con cuenta en euros, el número cambia. Por eso, antes de usar la fórmula, confirma con el bróker el valor del pip del instrumento que estás usando. En el oro, la convención de pip y de tamaño del contrato también varía de un bróker a otro.

:::exercicio Calcula tu posición
1. Escribe el valor de tu cuenta (puede ser un valor hipotético): ____________
2. Calcula el 1 % de ese valor. Riesgo en dinero: ____________
3. Define la distancia del stop, en pips, antes de mirar el precio: ____________
4. Confirma con el bróker el valor del pip por lote para el instrumento: ____________
5. Aplica la fórmula: riesgo ÷ (pips × valor del pip). Tamaño: ____________ lotes
6. Haz la prueba: pips × valor del pip × tamaño debe dar tu riesgo en dinero. ¿Cuadra? ____
:::

:::ecra Calculadora de posición (ejemplo ilustrativo)
Saldo de la cuenta: 1.000 $
Riesgo por operación: 1 % = 10 $
Distancia al stop: 50 pips
Valor por pip (0,01 lote): ≈ 0,10 $
Lote máximo: 0,02
:::

## Riesgo y retorno: la cuenta del equilibrio

Otra idea que cambia la forma de ver una operación es la relación entre el riesgo y el retorno esperado. Si arriesgas 1 para ganar 2, la operación es 1:2. Parece una regla de suerte, pero es solo matemática.

Cuando sabes cuánto arriesgas y cuánto puedes ganar, hay una tasa de acierto mínima para quedarte en cero, antes de costes. La fórmula es 1 ÷ (1 + R), donde R es el ratio de retorno.

| Relación riesgo:retorno | Tasa de acierto de equilibrio (antes de costes) |
|---|---|
| 1:1 | 50 % |
| 1:2 | 33,3 % |
| 1:3 | 25 % |

La lectura de la tabla es esta: con 1:2, necesitas acertar alrededor de un tercio de las operaciones para no perder dinero, sin contar spreads ni comisiones. Con 1:1, necesitas acertar la mitad. Los costes siempre suben ese umbral, y por eso ignorar el spread es un error tan caro.

[[grafico:winrate-rr]]

Fíjate en que estos números no son una predicción de nadie. Son una cuenta de equilibrio. Te dicen el mínimo que necesitas para no perder, y nada más.

:::curso Lección 407 · Riesgo y recompensa
No necesitas acertar siempre. Necesitas que, cuando aciertas, ganes más de lo que pierdes cuando fallas.

Ejemplo ilustrativo, sin costes: diez operaciones con riesgo de 1 y objetivo de 2. Aciertas cuatro (+8) y fallas seis (−6). Fallaste más de lo que acertaste y, aun así, la cuenta cerró en +2.

Esto no es una promesa de que vayas a acertar cuatro de cada diez. Es solo matemática, y por eso se elige el objetivo antes de entrar.

en el curso: haces esta cuenta con tu propio diario de demo, y no con números de ejemplo.
:::

## Las rachas de pérdidas son normales

Este es el punto donde la mayoría se rinde. Una racha de pérdidas no significa que el sistema esté roto, ni que tú seas malo para esto. Significa que la probabilidad ha hecho su trabajo.

Imagina una cuenta de 1.000 € que pierde diez operaciones seguidas. Lo que ocurre depende del riesgo por operación:

| Riesgo por operación | Capital tras 10 pérdidas seguidas |
|---|---|
| 1 % | unos 904 € |
| 2 % | unos 817 € |
| 5 % | unos 599 € |
| 10 % | unos 349 € |

Ejemplo ilustrativo, hipotético. La tabla muestra lo que hace la regla: con un 1 %, una racha muy mala te quita cerca de un 10 % del capital. Con un 10 %, te quita dos tercios. La misma secuencia, con dos comportamientos completamente distintos.

[[grafico:risco-sequencias]]

### Pensar en probabilidades

Hay un libro que he leído más veces de las que me gustaría admitir: «Trading in the Zone», de Mark Douglas. La idea central cabe en una línea. Cada operación es un suceso único, y el resultado de una no te dice nada sobre la siguiente. Lo que tienes a tu favor no es acertar en esta. Es repetir un proceso con ventaja muchas veces, sin que una pérdida te saque del juego.

Cuando leí esto por primera vez, entendí por qué me ponía furioso después de un stop. Quería que cada operación me diera la razón. El mercado no funciona así, y el chaleco sirve precisamente para aguantar la parte en la que no te da la razón.

:::destaque
No necesitas saber lo que va a pasar después para ganar dinero a largo plazo. Necesitas saber cuánto pierdes si te equivocas, y aceptar esa pérdida antes de hacer clic.
:::

Ahora una pregunta que suelo hacer a quien empieza: ¿cuántas rachas de pérdidas son probables? Piensa en una moneda al aire, con un 50 % de probabilidad para cada lado. Si lanzas la moneda 100 veces, la probabilidad de que aparezca al menos una racha de cinco o más «pérdidas» (caras, en el ejemplo) es de alrededor del 81 %. No es mala suerte rara. Es lo esperado.

[[grafico:sequencia-perdas]]

:::destaque
Una racha de pérdidas no es prueba de que el plan esté mal. Antes de juzgarlo, tienes que saber si el tamaño de la pérdida cabía en el riesgo que habías definido.
:::

:::historia
Ejemplo ilustrativo. Un operador tiene una semana de cinco pérdidas. En lugar de parar, sube el lote el viernes para «recuperarlo todo de una vez». El viernes acaba peor que la semana entera. El plan no falló el viernes. Falló en el momento en que el tamaño de la posición dejó de seguir la regla.
:::

:::cartao Reglas del chaleco
- Nunca más del 1 % por operación.
- Stop definido antes de entrar.
- Dos pérdidas seguidas: paro el día.
- He perdido un 5 % en la semana: paro la semana.
- Nunca mover el stop más lejos.
:::

## Cómo se lleva el chaleco en el día a día

Tres reglas sencillas que te ayudan a mantener el chaleco puesto:

- Definir el riesgo en dinero y el stop antes de entrar. Nunca después.
- Nunca aumentar el tamaño de la posición para recuperar una pérdida.
- Cuando la pérdida diaria alcance el límite que escribiste, cerrar la pantalla. El límite diario es el capítulo 9.

:::story
¿Cuál de estas reglas es la que más te cuesta cumplir?
sticker: Stop antes de entrar | Parar tras 2 pérdidas
:::

## En resumen

- Antes que nada, decide cuánto estás dispuesto a perder en una operación.
- Con la regla del 1 %, en una cuenta de 2.000 $, el riesgo es 20 $, y el tamaño depende de la distancia del stop.
- La fórmula es riesgo ÷ (pips × valor del pip). Confirma siempre el valor del pip con el bróker.
- Con 1:2, la tasa de acierto de equilibrio es de alrededor del 33 %, antes de costes.
- Las rachas de pérdidas son normales. La diferencia está en el riesgo que dejaste aceptar.

## Tu misión de esta semana

Escribe tu regla de riesgo en una hoja: el valor de tu riesgo por operación, la forma de calcular el tamaño de la posición y el límite de pérdida diaria. Fírmala, pon la fecha y guárdala donde la veas antes de cada operación.

:::destaque
Contenido educativo, no es asesoramiento financiero. Los ejemplos son hipotéticos y no son una previsión de resultados. El riesgo de pérdida es real, y puedes perder parte o la totalidad del capital.
:::
