# El tamaño correcto

> La entrada decide si tienes razón. El tamaño decide si sigues aquí para la próxima.

Dos personas abren exactamente la misma operación, en el mismo par, al mismo precio, con el mismo stop. El precio llega al stop. Una pierde 10 € y se encoge de hombros. La otra pierde 250 € y pasa la noche mirando al techo. La única diferencia entre las dos fue un número escrito en el campo «Volumen».

El tamaño de la posición es la decisión más importante y la más olvidada. Todo el mundo quiere hablar de entradas. Casi nadie quiere hablar de lotes.

## El riesgo empieza en dinero, no en lotes

La pregunta correcta no es «¿cuántos lotes abro?». Es «¿cuánto dinero acepto perder si esta operación sale mal?». La regla de la casa es no arriesgar más de **1 % de la cuenta** por operación. En una cuenta de 500 €, son 5 €.

Puede parecer poco. Es a propósito. Con un 1 %, diez pérdidas seguidas (y van a llegar) te quitan unos 10 % de la cuenta. Con un 10 %, te quitan dos tercios.

[[grafico:risco-sequencias]]

## La fórmula

**Lote = Riesgo en dinero ÷ (Distancia del stop en pips × Valor del pip por lote)**

Ejemplo ilustrativo, cuenta en dólares para simplificar, en el EUR/USD:

| Paso | Cálculo | Resultado |
|---|---|---|
| 1. Cuenta | | 500 $ |
| 2. Riesgo (1 %) | 1 % de 500 $ | 5 $ |
| 3. Stop | de la entrada al stop del plan | 25 pips |
| 4. Valor del pip por lote | EUR/USD, cuenta en USD | 10 $ |
| 5. Lote | 5 ÷ (25 × 10) | 0,02 |

Prueba: 25 pips × 0,02 lotes × 10 $ = 5 $. Cuadra con el riesgo.

Fíjate en lo que esto significa: **el stop decide el lote, y no al revés**. Si tu idea necesita un stop de 50 pips, el lote baja a la mitad (0,01). Si el stop es de 12 pips, el lote sube. El riesgo en dinero siempre queda igual.

:::alerta Error clásico · Apretar el stop para que quepa un lote mayor
Quieres abrir 0,10 lotes porque «así sí merece la pena». Para que el riesgo no pase de 5 $, el stop tendría que quedar a 5 pips de la entrada, dentro del ruido normal del mercado. Cualquier vela te saca del mercado y la idea, que incluso estaba bien, nunca tuvo espacio para funcionar. El lote se ajusta al stop. El stop nunca se ajusta al lote.
:::

:::alerta Error clásico · Subir el lote para recuperar
Has perdido tres seguidas y la cuarta va a ser «con el doble, para recuperarlo todo». Es la frase más cara del Forex. La cuarta operación no sabe que perdiste las otras tres, y la probabilidad de que salga mal es exactamente la misma. La diferencia es que ahora va a doler el doble. Después de las pérdidas, el lote se queda igual o baja. Nunca sube.
:::

## La calculadora (y la prueba a mano)

Hay calculadoras de tamaño de posición gratuitas en internet, y algunos brókeres muestran el riesgo en la propia pantalla de la orden. Úsalas. Pero haz la prueba a mano en las primeras 20 operaciones, hasta que la cuenta te salga de cabeza.

:::ecra Calculadora de posición (ejemplo ilustrativo)
Cuenta: 500 $
Riesgo: 1 % = 5 $
Par: EUR/USD
Stop: 25 pips
Valor del pip (1 lote): 10 $
Lote: 0,02
:::

Dos notas honestas:

- Con cuenta en **euros**, el valor del pip cambia con el tipo de cambio del día. Confírmalo en el MT5 o en el bróker.
- En el **oro** y en los índices, el tamaño del contrato y el valor de cada movimiento cambian de un bróker a otro. Lee la especificación antes de aplicar la fórmula.

## ¿Y si la cuenta es pequeña?

Con 200 € y un 1 % de riesgo, arriesgas 2 € por operación. Con el lote mínimo de 0,01 (unos 0,10 $ por pip en el EUR/USD), eso da un stop de unos 20 pips. Si tu idea necesita más, no hay un lote más pequeño al que bajar. Tienes dos salidas honestas: esperar una entrada con un stop más corto, o no entrar. «Arriesgar un 5 % solo esta vez» no es una salida. Es el principio del problema.

## La regla fría de este capítulo

:::cartao Regla fría n.º 6
1 % por operación. El stop decide el lote. Después de perder, el lote no sube. Hago la prueba de la cuenta antes de hacer clic.
:::

## En resumen

- El riesgo se decide en dinero: 1 % de la cuenta por operación.
- Lote = riesgo ÷ (pips de stop × valor del pip).
- El stop viene del gráfico; el lote viene de la cuenta.
- Nunca aprietes el stop para que quepa un lote mayor, nunca subas el lote para recuperar.
- Con una cuenta pequeña, la respuesta honesta muchas veces es esperar.

:::exercicio Calcula tres posiciones
1. Cuenta: ______ · riesgo 1 %: ______
2. Operación A, stop de 20 pips. Lote: ______ · prueba: ______
3. Operación B, stop de 40 pips. Lote: ______ · prueba: ______
4. Operación C, stop de 60 pips. Lote: ______ · prueba: ______
5. ¿El lote de la C es mayor o menor que el de la A? ¿Por qué? ____________
:::
