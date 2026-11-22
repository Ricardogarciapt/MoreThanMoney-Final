# El tamaño correcto

> La entrada decide si tienes razón. El tamaño decide si sigues aquí para la próxima.

Dos personas abren exactamente la misma operación, en el mismo par, al mismo precio, con el mismo stop. El precio llega al stop. Una pierde 10 € y se encoge de hombros. La otra pierde 250 € y pasa la noche mirando el techo. La única diferencia entre las dos fue un número escrito en el campo «Volumen».

El tamaño de la posición es la decisión más importante y la más olvidada. Todo el mundo quiere hablar de entradas. Casi nadie quiere hablar de lotes.

## El riesgo empieza en dinero, no en lotes

La pregunta correcta no es «¿cuántos lotes abro?». Es «¿cuánto dinero acepto perder si esta operación sale mal?». La regla de la casa es no arriesgar más de **1 % de la cuenta** por operación. En una cuenta de 500 €, son 5 €.

Puede parecer poco. Es a propósito. Con 1 %, diez pérdidas seguidas (y van a llegar) te quitan cerca del 10 % de la cuenta. Con 10 %, te quitan dos tercios.

[[grafico:risco-sequencias]]

## La fórmula

**Lote = Riesgo en dinero ÷ (Distancia del stop en pips × Valor del pip por lote)**

Ejemplo ilustrativo, con cuenta en dólares para simplificar, en EUR/USD:

| Paso | Cálculo | Resultado |
|---|---|---|
| 1. Cuenta | | 500 $ |
| 2. Riesgo (1 %) | 1 % de 500 $ | 5 $ |
| 3. Stop | desde la entrada hasta el stop del plan | 25 pips |
| 4. Valor del pip por lote | EUR/USD, cuenta en USD | 10 $ |
| 5. Lote | 5 ÷ (25 × 10) | 0,02 |

Prueba: 25 pips × 0,02 lotes × 10 $ = 5 $. Cuadra con el riesgo.

Fíjate en lo que significa esto: **el stop decide el lote, y no al revés**. Si tu idea necesita un stop de 50 pips, el lote baja a la mitad (0,01). Si el stop es de 12 pips, el lote sube. El riesgo en dinero siempre queda igual.

:::alerta Error clásico · Apretar el stop para que quepa un lote mayor
Quieres abrir 0,10 lotes porque «así sí merece la pena». Para que el riesgo no pase de 5 $, el stop tendría que quedar a 5 pips de la entrada, dentro del ruido normal del mercado. El stop lo toca cualquier vela y la idea, que hasta estaba bien, nunca tuvo espacio para funcionar. El lote se ajusta al stop. El stop nunca se ajusta al lote.
:::

:::alerta Error clásico · Subir el lote para recuperar
Has perdido tres seguidas y la cuarta va a ser «con el doble, para recuperarlo todo». Es la frase más cara del Forex. La cuarta operación no sabe que perdiste las otras tres, y la probabilidad de que salga mal es exactamente la misma. La diferencia es que ahora va a doler el doble. Después de pérdidas, el lote se queda igual o baja. Nunca sube.
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

Y hay una prueba que el propio MetaTrader hace por ti. En la ventana de orden, debajo del campo del S/L, puedes ver el stop en **Precio**, en **Pips** o en **USD** (o en la moneda de tu cuenta). Elige la vista en dinero: si el número que aparece no es tu riesgo del 1 %, el lote está mal. En el próximo capítulo ves esa pantalla paso a paso.

Dos notas honestas:

- Con cuenta en **euros**, el valor del pip cambia con el cambio del día. Confírmalo en MT5 o en el bróker.
- En el **oro** y en los índices, el tamaño del contrato y el valor de cada movimiento cambian de un bróker a otro. Lee la especificación antes de aplicar la fórmula.

:::historia A Marta, dia 8
Marta quería abrir 0,10 lotes, «para que valga la pena». Con 500 € de demo y 1 % de riesgo, solo podía perder 5 €. Para que cupiera 0,10, el stop tendría que quedar a 5 pips de la entrada, dentro del ruido que había visto en el M1. Hizo la cuenta al revés: la zona del H4 pedía un stop de 25 pips, así que el lote era 0,02. Escribió los dos números en la libreta, uno al lado del otro. «El stop viene del gráfico. El lote viene de la cuenta.» Por primera vez, el número pequeño le pareció el correcto.
:::

## ¿Y cuando la cuenta es pequeña?

Con 200 € y 1 % de riesgo, arriesgas 2 € por operación. Con el lote mínimo de 0,01 (unos 0,10 $ por pip en EUR/USD), eso da un stop de unos 20 pips. Si tu idea necesita más, no hay un lote más pequeño al que bajar. Tienes dos salidas honestas: esperar a una entrada con stop más corto, o no entrar. «Arriesgar 5 % solo esta vez» no es una salida. Es el principio del problema.

## De mi vida: 1.037 € al mes

Entré en la GNR (Guardia Nacional Republicana) en 2010. Estuve allí catorce años. Al final, mi sueldo neto era de 1.037 € al mes, con mi mujer, una hija pequeña y tres horas de tren al día para ir y volver del Comando Territorial de Lisboa.

Con 1.037 € se aprende gestión del riesgo a la fuerza. Cada euro tiene un destino antes de llegar: alquiler, comida, transporte, colegio. No hay margen para «voy a arriesgar un poquito más este mes». Cuando empecé en el trading, traje esa cuenta conmigo. Fue ella la que me salvó de hacer lo que veo que hacen tantos: abrir una operación con el dinero de la cuota de la hipoteca.

La fórmula de este capítulo es la misma cuenta que hacía con mi sueldo. Primero decides cuánto puedes perder sin que tu vida cambie. Solo después descubres cuánto puedes comprar.

## La regla fría de este capítulo

:::cartao Regla fría n.º 5
1 % por operación. El stop decide el lote. Después de perder, el lote no sube. Hago la prueba de la cuenta antes de hacer clic.
:::

## En resumen

- El riesgo se decide en dinero: 1 % de la cuenta por operación.
- Lote = riesgo ÷ (pips de stop × valor del pip).
- El stop viene del gráfico; el lote viene de la cuenta.
- Nunca aprietes el stop para que quepa un lote mayor, nunca subas el lote para recuperar.
- Con cuenta pequeña, la respuesta honesta muchas veces es esperar.

:::exercicio Calcula tres posiciones
1. Cuenta: ______ · riesgo 1 %: ______
2. Operación A, stop de 20 pips. Lote: ______ · prueba: ______
3. Operación B, stop de 40 pips. Lote: ______ · prueba: ______
4. Operación C, stop de 60 pips. Lote: ______ · prueba: ______
5. ¿El lote de la C es mayor o menor que el de la A? ¿Por qué? ____________
:::
