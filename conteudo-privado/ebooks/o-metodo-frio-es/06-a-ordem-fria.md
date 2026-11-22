# La orden fría

> El clic es la parte más fácil. Lo difícil es todo lo que decides antes.

Hay un momento en que el pulgar se queda encima del botón «Comprar» y el corazón se acelera. Si en ese momento todavía estás decidiendo dónde va el stop, ya has perdido el control de la operación. La orden fría es aquella en la que, cuando el pulgar llega al botón, todo ya está escrito: entrada, stop, objetivo y lote. El clic es solo la firma.

Fíjate en el camino que has recorrido hasta aquí. Montaste el banco de trabajo (capítulo 1), aprendiste a leer las Cotizaciones (2), sabes cuánto vale un pip con tu volumen (3), dibujaste el mapa en el gráfico (4) y calculaste el lote según el riesgo (5). Este capítulo une todo en una sola pantalla: la ventana de orden.

## Los tipos de orden en MT5

| Tipo | Qué hace | Cuándo usarla |
|---|---|---|
| **Ejecución a mercado** | Compra o vende ya, al precio actual | Cuando el precio está en tu zona y el plan dice «entra» |
| **Buy Limit** | Compra si el precio **baja** hasta tu nivel | Esperar una corrección para comprar más barato |
| **Sell Limit** | Vende si el precio **sube** hasta tu nivel | Esperar una subida para vender más caro |
| **Buy Stop** | Compra si el precio **sube** por encima de tu nivel | Entrar cuando el precio rompe una resistencia |
| **Sell Stop** | Vende si el precio **baja** por debajo de tu nivel | Entrar cuando el precio rompe un soporte |

[[grafico:limit-stop]]

Las órdenes pendientes (limit y stop) tienen una ventaja enorme para quien trabaja: dejas la orden en el sitio correcto y te vas a tu vida. El precio viene a ti o no viene, y las dos cosas están bien.

[[grafico:fluxo-operacao]]

## El stop-loss y el take-profit

El **stop-loss (SL)** es el precio donde la operación se cierra sola si sale mal. El **take-profit (TP)** es el precio donde se cierra sola si sale bien.

- El stop se pone donde tu idea **deja de tener sentido**. Si compras porque el precio está en un soporte, el stop va por debajo de ese soporte, no «20 pips porque sí».
- El objetivo se pone donde hay una razón para que el precio se pare: la siguiente resistencia, la siguiente zona.
- Los dos se definen **antes** de entrar.

:::alerta Error clásico · Entrar sin stop «solo un poquito»
«Entro ya y pongo el stop después.» El después nunca llega a tiempo. El precio anda 30 pips en tu contra en un minuto de noticias, y ahora poner el stop significa aceptar una pérdida que no estaba planeada. Entonces no lo pones. Esperas. Así es como una operación de 10 € de riesgo se convierte en una de 200. Ninguna orden sale sin stop. Ninguna.
:::

## En la pantalla: la orden pendiente, paso a paso

Esta es la pantalla que más pesa en todo el libro. Fíjate en que la app te deja rellenarlo todo **antes** de pulsar el botón.

:::galeria Del tipo de orden al botón
mt5-tel-ordem-mercado.png | 1. Elige el tipo (aquí, Sell Limit), el volumen en lotes y el precio.
mt5-tel-grafico-sltp.png | 2. Activa el S/L: la línea aparece en el gráfico con la pérdida en dinero.
:::

:::galeria Confirmar sin prisa
mt5-tel-ordem.png | 3. Revisa volumen, precio y S/L. Solo después pulsas «Colocar».
mt5-tel-ordem-executada.png | 4. «Hecho»: el número de la orden, el precio y el stop.
:::

1. En **Cotizaciones**, toca el par y elige **Nueva orden**.
2. Arriba elige el tipo: **Ejecución a mercado**, **Buy Limit**, **Sell Limit**, **Buy Stop** o **Sell Stop**.
3. En **Volumen**, escribe el lote que calculaste en el capítulo 5. No el que «parece bien».
4. En **Precio**, escribe el precio de tu plan.
5. Activa **S/L** y **T/P** y escribe los precios. Debajo del campo tienes tres maneras de verlos: **Precio**, **Pips** y **USD** (o la moneda de tu cuenta). Usa la vista en dinero para confirmar que pierdes exactamente tu riesgo si se toca el stop.
6. Lee todo otra vez y pulsa **Colocar**.
7. Espera al **Hecho**. Ve a **Operaciones** y confirma que la orden está ahí con el stop.
8. Haz una captura. Guárdala en la carpeta «Diario».

:::nota La pantalla que te protege
En el paso 2 la app muestra la pérdida en dinero antes de confirmar. Si esa cifra te hace tragar saliva, el lote es demasiado grande. Vuelve al capítulo 5.
:::

En tu caso, la orden fría queda así: tipo Buy Limit, volumen 0,02, precio 1,08200, S/L 1,07950, T/P 1,08700. Son 25 pips de riesgo para 50 de objetivo, una relación riesgo:retorno de 1:2 (ejemplo ilustrativo).

En el ordenador es igual: **F9** (o el botón **Nueva orden**) abre la misma ventana, con los mismos campos, y ninguno queda en blanco. En el PC tienes una ventaja: puedes arrastrar las líneas del S/L y del T/P directamente en el gráfico.

[[foto: mt5-desktop-ordem.jpg | MetaTrader 5 en el ordenador: ventana «Nueva orden» con Stop Loss y Take Profit, y el historial abajo. Imagen: MetaQuotes (metatrader5.com). | larga]]

## Los errores de pantalla que cuestan dinero

:::alerta Error clásico · La coma en el lote
Querías 0,10 y escribiste 1,0. En el móvil esto pasa con un dedo torpe. Antes de colocar, lee el volumen en voz alta.
:::

:::alerta Error clásico · Cambiar Limit por Stop
Buy Limit compra más **barato** que el precio actual. Buy Stop compra más **caro**. Si los cambias, entras exactamente en el sitio equivocado. Vuelve al gráfico de este capítulo siempre que dudes.
:::

:::alerta Error clásico · Stop en pips cuando querías precio
El campo del S/L cambia según elijas Precio, Pips o USD. Confirma la pestaña antes de escribir el número.
:::

:::historia A Marta, dia 12
La primera orden en serio, todavía en la demo. Buy Limit en el EURUSD, en una zona que había dibujado el domingo. Marta escribió el volumen, el precio, el stop y el objetivo, y iba a pulsar «Colocar» cuando se acordó de leer en voz alta. «Volumen: uno coma cero.» Había escrito 1,0 en vez de 0,02. En la vista en USD, el stop costaba 250 $, la mitad de la cuenta. Corrigió, volvió a leer, colocó. Después fue a Operaciones a ver la orden allí parada, esperando. No sintió ninguna adrenalina. Sintió que había hecho el trabajo.
:::

## Después del «Hecho»: la pestaña Operaciones

Una orden colocada no es una orden olvidada. El tercer botón de la barra de abajo, **Operaciones**, te muestra todo lo que está vivo en la cuenta.

[[foto: mt5-android-negociacao.jpg | La pestaña de operaciones y el historial en MetaTrader 5 para Android y tablet. Aquí ves el saldo, el capital y el margen. Imagen: MetaQuotes (metatrader5.com). | larga]]

- Arriba: **saldo**, **capital**, **margen** y **margen libre**.
- Abajo: las **posiciones** abiertas, con el resultado moviéndose, y las **órdenes pendientes** a la espera.
- Para **modificar** o **cerrar**, mantén el dedo sobre la posición o la orden y elige la opción. En el PC, doble clic o botón derecho.

**Saldo** es el dinero sin contar las posiciones abiertas. **Capital** (*equity*) es el saldo más o menos lo que las posiciones abiertas están ganando o perdiendo. En una demo de 500 € sin nada abierto, los dos muestran 500,00 € (ilustrativo). Cuando tienes una operación abierta, mira siempre el capital: ese es el número real.

:::alerta Error clásico · Alejar el stop cuando el precio se acerca
El precio está a dos pips de tu stop y modificas la posición para arrastrar el S/L más lejos, «para dar espacio». Acabas de cambiar el plan a mitad, con el corazón, y de aumentar el riesgo que habías aceptado. Un stop solo se mueve en una dirección: a favor de la operación, para proteger. Nunca alejándolo.
:::

## De mi vida: nadie salta sin revisar

Antes de cada salto en los paracaidistas había una revisión del equipo, siempre en el mismo orden, hecha por ti y por el compañero de al lado. Nadie la saltaba porque «ya lo sabía». En los Fuzileiros (infantería de marina) era igual con el material, con las armas y con la embarcación. La revisión no existe para el que es despistado. Existe porque el momento de la acción es el peor momento para pensar.

Una orden en el mercado es un salto pequeño. Tiene un equipo (volumen, stop, objetivo), una puerta (el botón) y una luz (tu plan). La checklist que viene a continuación es mi revisión antes de saltar. La hago siempre, aunque «sea obvio».

## La checklist antes de hacer clic

Pega esto cerca de la pantalla. Si una de las respuestas es «no», la orden no sale.

:::cartao Checklist de la orden fría
- ¿El par y la hora están en mi plan?
- ¿Hay noticias fuertes en los próximos 30 minutos?
- ¿Sé por qué entro, en una frase?
- ¿El stop está donde la idea deja de tener sentido?
- ¿El lote salió de la cuenta del riesgo, y la vista en dinero lo confirma?
- ¿La relación riesgo:retorno es de al menos 1:1,5?
- ¿Estoy tranquilo? (de 1 a 5, al menos 3)
:::

:::conversa Notas del móvil · eu
eu: Ganas de entrar en el GBP/USD ahora. Ha subido 60 pips en una hora.
eu: Checklist: no está en el plan. No sé dónde poner el stop. Calma: 2 de 5.
eu: No entro. Lo anoto en el diario como «ganas, no plan».
:::

Este tipo de nota vale más que cualquier operación ganada. Aprendes a reconocer las ganas antes de que te cuesten dinero.

## Mapa rápido: dónde está cada cosa

Ahora que ya has usado todas las pantallas, guarda este mapa. Sirve de chuleta hasta que los dedos sepan el camino solos.

| Quiero… | En el móvil | En el PC |
|---|---|---|
| Ver precios | Cotizaciones | Observación del mercado (Ctrl+M) |
| Añadir un par | Cotizaciones › + | Observación del mercado › botón derecho › Símbolos |
| Abrir una orden | Cotizaciones › par › Nueva orden | F9 |
| Cambiar la temporalidad del gráfico | Gráfico › mantener el dedo › temporalidad | Barra de temporalidades, arriba |
| Poner un indicador | Gráfico › *f* | Insertar › Indicadores |
| Dibujar una zona o Fibonacci | Gráfico › objetos | Insertar › Objetos |
| Ver posiciones y margen | Operaciones | Caja de herramientas › Operaciones |
| Ver lo que ya se cerró | Historial | Caja de herramientas › Historial |
| Calendario económico | Ajustes › Tradays | Caja de herramientas › Calendario |
| Alertas de precio | Llegan por push, creadas en el PC (capítulo 7) | Caja de herramientas › Alertas |

## La regla fría de este capítulo

:::cartao Regla fría n.º 6
Ninguna orden sale sin stop. El stop nunca se aleja. La checklist se hace siempre, incluso cuando «es obvio». Leo el volumen en voz alta antes de colocar.
:::

## En resumen

- Hay órdenes a mercado y pendientes (limit y stop); las pendientes te dejan vivir tu vida.
- Limit: el precio vuelve hasta ti. Stop: el precio rompe y sigue.
- El stop va donde la idea deja de tener sentido; el objetivo, donde hay razón para que el precio se pare.
- En la ventana de orden, todo rellenado antes de «Colocar», con la vista en dinero confirmando el riesgo.
- Después del «Hecho», lo confirmas en Operaciones. El stop solo se mueve a tu favor.
- La checklist de siete preguntas decide si la orden sale o no.

:::exercicio Para hacer hoy
1. En la demo, abre tres órdenes pendientes en tu par: una Buy Limit, una Sell Limit y una Buy Stop, todas con SL y TP.
2. En cada una, confirma en la vista en dinero que el stop cuesta tu riesgo del 1 %.
3. Ve a Operaciones y confirma que las tres aparecen con los niveles correctos.
4. Modifica una (cambia el objetivo) y luego cancela las tres. El objetivo era solo entrenar los dedos.
5. Escribe en la libreta la frase que vas a usar para justificar cada entrada a partir de ahora: «Entro porque ____________».
:::
