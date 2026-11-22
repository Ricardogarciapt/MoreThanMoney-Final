# La orden fría

> El clic es la parte más fácil. Lo difícil es todo lo que decides antes de él.

Hay un momento en que el pulgar se queda encima del botón «Comprar» y el corazón se acelera. Si en ese momento todavía estás decidiendo dónde va el stop, ya has perdido el control de la operación. La orden fría es aquella en la que, cuando el pulgar llega al botón, ya está todo escrito: entrada, stop, objetivo y lote. El clic es solo la firma.

## Los tipos de orden en el MT5

| Tipo | Qué hace | Cuándo usarla |
|---|---|---|
| **Ejecución a mercado** | Compra o vende ya, al precio actual | Cuando el precio está en tu zona y el plan dice «entra» |
| **Buy Limit** | Compra si el precio **baja** hasta tu nivel | Esperar una corrección para comprar más barato |
| **Sell Limit** | Vende si el precio **sube** hasta tu nivel | Esperar una subida para vender más caro |
| **Buy Stop** | Compra si el precio **sube** por encima de tu nivel | Entrar cuando el precio rompe una resistencia |
| **Sell Stop** | Vende si el precio **baja** por debajo de tu nivel | Entrar cuando el precio rompe un soporte |

Las órdenes pendientes (limit y stop) tienen una ventaja enorme para quien trabaja: dejas la orden en el sitio correcto y te vas a tu vida. El precio viene a ti o no viene, y las dos cosas están bien.

[[grafico:fluxo-operacao]]

## El stop-loss y el take-profit

El **stop-loss (SL)** es el precio al que la operación se cierra sola si sale mal. El **take-profit (TP)** es el precio al que se cierra sola si sale bien.

- El stop se pone donde tu idea **deja de tener sentido**. Si compras porque el precio está en un soporte, el stop va por debajo de ese soporte, no «20 pips porque sí».
- El objetivo se pone donde hay una razón para que el precio se detenga: la siguiente resistencia, la siguiente zona.
- Los dos se definen **antes** de entrar.

:::alerta Error clásico · Entrar sin stop «solo un poquito»
«Entro ya y pongo el stop después.» El después nunca llega a tiempo. El precio se mueve 30 pips en tu contra en un minuto de noticias, y ahora poner el stop significa aceptar una pérdida que no estaba planeada. Entonces no lo pones. Esperas. Así es como una operación con 10 € de riesgo se convierte en una de 200. Ninguna orden sale sin stop. Ninguna.
:::

:::alerta Error clásico · Alejar el stop cuando el precio se acerca
El precio está a dos pips de tu stop y tú arrastras la línea más lejos, «para dar espacio». Acabas de cambiar el plan a mitad, con el corazón, y de aumentar el riesgo que habías aceptado. Un stop solo se mueve en una dirección: a favor de la operación, para protegerla. Nunca hacia lejos.
:::

## Paso a paso: abrir una orden en el móvil

1. En **Cotizaciones**, toca el par y elige **Nueva orden**.
2. En tipo, elige **Ejecución a mercado** o el tipo de orden pendiente de tu plan.
3. En **Volumen**, escribe el lote que calculaste (capítulo 6). No el número que «parece bien».
4. Rellena **S/L** y **T/P** con los precios del plan.
5. Confirma el resumen. Solo después pulsas comprar o vender.
6. Ve a **Operaciones** y confirma que la posición aparece con SL y TP rellenos.
7. Haz una captura. Va al diario.

[[foto: mt5-ios-ordem.jpg | La ventana de orden en el MetaTrader 5 para iPhone: volumen, Stop Loss y Take Profit rellenos antes de tocar «Sell» o «Buy». Imagen: MetaQuotes (metatrader5.com). | larga]]

*Las pantallas reales de la app, organizadas por temas, están en la **Guía visual de MetaTrader 5**, al final del libro.*


En tu caso, la orden fría queda así: tipo Buy Limit, volumen 0,02, precio 1,08200, S/L 1,07950, T/P 1,08700. Son 25 pips de riesgo por 50 de objetivo (ejemplo ilustrativo).

Es decir, una relación riesgo:beneficio de 1:2.

En el ordenador es igual: la ventana «Nueva orden» tiene los mismos campos, y ninguno queda en blanco.

[[foto: mt5-desktop-ordem.jpg | MetaTrader 5 en el ordenador: ventana «Nueva orden» con Stop Loss y Take Profit, y el historial abajo. Imagen: MetaQuotes (metatrader5.com). | larga]]

## La lista de comprobación antes de hacer clic

Pega esto cerca de la pantalla. Si una de las respuestas es «no», la orden no sale.

:::cartao Lista de comprobación de la orden fría
- ¿El par y la hora están en mi plan?
- ¿Hay noticias fuertes en los próximos 30 minutos?
- ¿Sé por qué entro, en una frase?
- ¿El stop está donde la idea deja de tener sentido?
- ¿El lote ha salido de la cuenta del riesgo?
- ¿La relación riesgo:beneficio es de al menos 1:1,5?
- ¿Estoy tranquilo? (de 1 a 5, como mínimo 3)
:::

:::conversa Notas del móvil · eu
eu: Ganas de entrar en el GBP/USD ahora. Ha subido 60 pips en una hora.
eu: Lista de comprobación: no está en el plan. No sé dónde poner el stop. Calma: 2 de 5.
eu: No entro. Lo anoto en el diario como «ganas, no plan».
:::

Este es el tipo de nota que vale más que cualquier operación ganadora. Aprendes a reconocer las ganas antes de que te cuesten dinero.

## La regla fría de este capítulo

:::cartao Regla fría n.º 4
Ninguna orden sale sin stop. El stop nunca se aleja. La lista de comprobación se hace siempre, incluso cuando «es obvio».
:::

## En resumen

- Existen órdenes a mercado y pendientes (limit y stop); las pendientes te dejan vivir tu vida.
- El stop va donde la idea deja de tener sentido; el objetivo, donde hay razón para que el precio se detenga.
- Stop y objetivo se definen antes de entrar, en la pantalla de la orden.
- La lista de siete preguntas decide si la orden sale o no.

:::exercicio Para hacer hoy
1. En la demo, abre tres órdenes pendientes en tu par: una Buy Limit, una Sell Limit y una Buy Stop, todas con SL y TP.
2. Confirma en «Operaciones» que las tres aparecen con los niveles correctos.
3. Cancélalas. El objetivo era solo entrenar los dedos.
4. Escribe en la libreta la frase que vas a usar para justificar cada entrada a partir de ahora: «Entro porque ____________».
:::
