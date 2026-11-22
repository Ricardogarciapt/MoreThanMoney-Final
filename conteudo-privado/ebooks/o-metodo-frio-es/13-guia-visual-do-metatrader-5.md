# Guía visual de MetaTrader 5

> Pon la app al lado del libro y sigue con el dedo. Nadie aprende a nadar leyendo sobre el agua.

Los capítulos explican el porqué. Esta guía muestra el dónde. He reunido aquí, por temas, las pantallas de MetaTrader 5 en el móvil que vas a usar todos los días: de la cuenta demo a la confirmación de una orden. Son capturas reales de la app, en una cuenta de ejemplo y con los datos de la cuenta difuminados. Los números que aparecen (lotes, precios, saldos) son del ejemplo, no son una recomendación.

Abre tu demo, deja el móvil al lado del libro y haz cada paso a medida que lees.

[[foto: mt5-tel-trio.png | Cotizaciones, gráfico y ventana de orden: las tres pantallas donde vas a pasar casi todo el tiempo. | larga]]

## 1. La barra de abajo: cinco botones

Todo en el MT5 del móvil empieza en la barra de abajo. De izquierda a derecha:

| Botón | Para qué sirve |
|---|---|
| **Cotizaciones** (flechas) | La lista de pares, con el precio de venta y el de compra |
| **Gráfico** (velas) | El gráfico del par elegido |
| **Operaciones** (línea) | Las posiciones abiertas, el saldo, el capital y el margen |
| **Historial** (reloj) | Lo que ya se cerró: de aquí sale el diario |
| **Ajustes** (rueda dentada) | Cuentas, noticias, calendario y preferencias |

:::nota Si te pierdes
Toca Cotizaciones. Es el punto de partida de casi todo, como la puerta de casa.
:::

## 2. Ajustes: abrir la cuenta demo

:::galeria La primera pantalla que visitar
mt5-tel-conta.png | En Ajustes: Nueva cuenta, noticias, calendario (Tradays) y gráficos.
:::

1. Toca **Ajustes** y después **Nueva cuenta**.
2. Busca el bróker por su nombre y elige el servidor **demo**.
3. Elige un saldo realista, igual al dinero que un día vas a usar de verdad. Entrenar con 100 000 € cuando vas a empezar con 500 € te enseña los reflejos equivocados.
4. Guarda el número de cuenta y la contraseña fuera del móvil.

En esta pantalla también están las **Noticias** y el calendario económico (**Tradays**), que usamos en el capítulo 7.

## 3. Cotizaciones: leer el precio

:::galeria Cada línea es un par
mt5-tel-cotacoes.png | Venta a la izquierda, compra a la derecha. Debajo, el mínimo (L) y el máximo (H) del día.
:::

En cada línea tienes:

- **El par** (EURUSD, GBPCAD…) y, encima, la variación del día en puntos y en porcentaje.
- **La hora del último precio** y, al lado, el **spread** en puntos: la diferencia entre comprar y vender.
- **Dos precios grandes.** El de la izquierda es el precio al que vendes (Bid) y el de la derecha el precio al que compras (Ask).
- **L y H**: el mínimo y el máximo del día.

:::cartao Rojo no es perder
Los colores solo dicen si el último precio bajó (rojo) o subió (azul) respecto al anterior. No tienen nada que ver con tu cuenta.
:::

Para abrir una orden o un gráfico, toca el par y elige la opción en el menú que aparece.

### Añadir un par a la lista

:::galeria Buscar por el nombre
mt5-tel-procurar-simbolo.png | Toca el «+» en Cotizaciones y escribe el nombre del par. Los activos vienen agrupados: Forex, materias primas, índices y cripto.
:::

Mantén la lista corta. Los pares de tu plan y poco más. Una lista de cuarenta líneas invita a buscar oportunidades en vez de esperar las tuyas.

## 4. El gráfico: el mismo par en dos temporalidades

:::galeria Cambiar la temporalidad cambia la historia
mt5-tel-grafico.png | M1: cada vela es un minuto. Mucho ruido.
mt5-tel-grafico-velas.png | H1: cada vela es una hora. La tendencia se ve mejor.
:::

- **Cambiar el periodo:** toca el gráfico y elige M1, M5, M15, M30, H1, H4, D1… En el método frío decides primero en H1 o H4 y solo después afinas la entrada en una temporalidad menor (capítulo 5).
- **La línea del precio:** la etiqueta de color a la derecha marca el precio actual.
- **Indicadores:** el botón *f* arriba. Pon uno, dos como máximo.
- **Objetos:** líneas, zonas y Fibonacci también están arriba. Dibuja tus zonas antes de pensar en entrar.

:::galeria Periodo e indicadores
mt5-tel-periodos.png | Mantén el dedo en el gráfico para elegir el periodo: minutos, horas y días.
mt5-tel-indicadores.png | En el botón f eliges el indicador por familias: tendencia, osciladores, volúmenes.
:::

:::galeria Dibujar y afinar
mt5-tel-objetos.png | La lista de objetos dibujados, por par. Desde aquí los editas, ocultas o borras.
mt5-tel-fibonacci.png | Las propiedades de un Fibonacci: puntos, niveles, color y estilo.
:::

### Poner el gráfico a tu gusto

:::galeria Menos ruido, mejor lectura
mt5-tel-definicoes-grafico.png | En Ajustes › Gráficos eliges velas japonesas y lo que aparece en pantalla.
mt5-tel-cores.png | Los colores de cada parte del gráfico. Elige un esquema y no lo toques más.
:::

Activa solo lo que usas. La línea Ask ayuda a ver el precio de compra. La cuenta atrás para el cierre de la vela ayuda a no decidir a mitad de una vela. El resto puede quedarse apagado.

:::alerta Error clásico · Vivir en el M1
En el gráfico de 1 minuto todo parece una oportunidad. Es la temporalidad en la que más se opera y menos se piensa. Ábrelo solo cuando ya hayas decidido en una mayor.
:::

## 5. La orden pendiente, paso a paso

Esta es la pantalla que más cuenta. Fíjate en que la app te deja rellenarlo todo **antes** de pulsar el botón.

:::galeria Del tipo de orden al botón
mt5-tel-ordem-mercado.png | 1. Elige el tipo (aquí, Sell Limit), el volumen en lotes y el precio.
mt5-tel-grafico-sltp.png | 2. Activa el S/L: la línea aparece en el gráfico con la pérdida en dinero.
:::

:::galeria Confirmar sin prisa
mt5-tel-ordem.png | 3. Revisa volumen, precio y S/L. Solo después tocas «Colocar».
mt5-tel-ordem-executada.png | 4. «Hecho»: el número de la orden, el precio y el stop.
:::

1. En **Cotizaciones**, toca el par y elige **Nueva orden**.
2. Arriba elige el tipo: **Ejecución de mercado**, **Buy Limit**, **Sell Limit**, **Buy Stop** o **Sell Stop** (el capítulo 4 explica cuándo usar cada uno).
3. En **Volumen**, escribe el lote que calculaste en el capítulo 6. No el que «parece bien».
4. En **Precio**, escribe el precio de tu plan.
5. Activa **S/L** y **T/P** y escribe los precios. Debajo del campo tienes tres formas de verlos: **Precio**, **Pips** y **USD** (o la moneda de tu cuenta). Usa USD para ver cuánto pierdes si se toca el stop.
6. Léelo todo otra vez y toca **Colocar**.
7. Espera al **Hecho**. Ve a **Operaciones** y confirma que la orden está ahí con el stop.

:::nota La pantalla que te protege
En el paso 2 la app muestra la pérdida en dinero antes de confirmar. Si esa cifra te hace tragar saliva, el lote es demasiado grande. Vuelve al capítulo 6.
:::

## 6. Mapa rápido: dónde está cada cosa

| Quiero… | Dónde toco |
|---|---|
| Ver precios | Cotizaciones |
| Abrir una orden | Cotizaciones › par › Nueva orden |
| Cambiar la temporalidad | Gráfico › tocar la pantalla › periodo |
| Poner un indicador | Gráfico › *f* |
| Dibujar una zona o Fibonacci | Gráfico › objetos |
| Ver posiciones y margen | Operaciones |
| Ver lo que ya se cerró | Historial |
| Calendario económico | Ajustes › Tradays |
| Abrir otra cuenta demo | Ajustes › Nueva cuenta |

## 7. Los errores de pantalla que cuestan dinero

:::alerta Error clásico · La coma en el lote
Querías 0,10 y escribiste 1,0. En el móvil pasa con un dedo torpe. Antes de colocar, lee el volumen en voz alta.
:::

:::galeria El selector de lotes
mt5-tel-ordem-lotes.png | Al tocar el volumen se abre un selector con botones de −0,10 a +0,10. Confirma el número grande antes de cerrarlo.
:::

:::alerta Error clásico · Confundir Limit con Stop
Buy Limit compra más **barato** que el precio actual. Buy Stop compra más **caro**. Si los cambias, entras exactamente en el sitio equivocado.
:::

:::alerta Error clásico · Stop en pips cuando querías precio
El campo del S/L cambia según elijas Precio, Pips o USD. Confirma la pestaña antes de escribir el número.
:::

## La regla fría de esta guía

Ninguna orden sale sin pasar por estas tres pantallas: el gráfico en tu temporalidad de decisión, la ventana de orden con el S/L relleno y la confirmación en Operaciones. Si falta una, no hubo orden fría.

*Contenido educativo. Capturas reales de la app MetaTrader 5, en una cuenta de ejemplo y con los datos de la cuenta difuminados. Los valores mostrados no son una recomendación. Operar Forex y CFD con apalancamiento implica un riesgo elevado de pérdida.*
