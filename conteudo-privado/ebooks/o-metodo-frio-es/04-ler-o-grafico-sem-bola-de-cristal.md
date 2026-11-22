# Leer el gráfico sin bola de cristal

> El gráfico no te dice lo que va a pasar. Te dice dónde otras personas ya han cambiado de opinión.

Hay quien mira un gráfico como quien lee el horóscopo. Busca un patrón, una figura, una señal secreta que diga «ahora sube». No existe. Lo que el gráfico te muestra es un registro: dónde ha estado el precio, dónde se ha parado, dónde ha dado marcha atrás. A partir de ahí, tu trabajo es marcar las zonas donde tiene sentido actuar y definir de antemano qué haces si el precio llega allí.

Leer un gráfico, en el método frío, es dibujar un mapa. No es adivinar el destino. Y el mapa se dibuja en el segundo botón de la barra de abajo: **Gráfico**.

## La vela

Ya dejaste el gráfico en velas japonesas en el capítulo 1. Ahora vas a entender por qué. Cada vela muestra una temporalidad (un minuto en M1, una hora en H1) y guarda cuatro precios:

[[grafico:anatomia-vela]]

- **Cuerpo**: entre la apertura y el cierre. Dorado (o verde, o azul, según tus colores) si cerró por encima de la apertura; oscuro (o rojo) si cerró por debajo.
- **Mechas**: el máximo y el mínimo al que llegó el precio en esa temporalidad.

Una mecha larga arriba significa que el precio subió y fue empujado hacia abajo antes de que la vela cerrara. Es información, no profecía.

## En la pantalla: el mismo par en dos temporalidades

Abre el gráfico de tu par: en **Cotizaciones**, toca el par y elige **Gráfico**. Ahora fíjate en lo que cambia cuando cambias la temporalidad.

:::galeria Cambiar la temporalidad cambia la historia
mt5-tel-grafico.png | M1: cada vela es un minuto. Mucho ruido.
mt5-tel-grafico-velas.png | H1: cada vela es una hora. La tendencia se ve mejor.
:::

[[grafico:tempos-grafico]]

Para cambiar la temporalidad, mantén el dedo sobre el gráfico y elige M1, M5, M15, M30, H1, H4, D1… En el PC tienes los botones en la barra superior.

:::galeria Elegir la temporalidad
mt5-tel-periodos.png | Mantén el dedo sobre el gráfico para elegir la temporalidad: minutos, horas y días.
:::

Dos gestos más que ahorran tiempo: **arrastra** hacia la izquierda y hacia la derecha para moverte en el tiempo, y **separa o junta dos dedos** para ver más o menos velas. La etiqueta de color a la derecha marca el precio actual.

:::alerta Error clásico · Vivir en el M1
En el gráfico de 1 minuto todo parece una oportunidad. Es la temporalidad en la que más se opera y menos se piensa. Ábrelo solo cuando ya hayas decidido en una mayor.
:::

## Tendencia: máximos y mínimos

La forma más sencilla de leer la dirección es mirar los máximos y los mínimos:

| Tendencia | Máximos | Mínimos | Lo que buscas |
|---|---|---|---|
| **Alcista** | cada vez más altos | cada vez más altos | compras en correcciones |
| **Bajista** | cada vez más bajos | cada vez más bajos | ventas en subidas |
| **Lateral** | más o menos al mismo nivel | más o menos al mismo nivel | quedarse fuera, o operar los límites con cuidado |

Empieza siempre por el gráfico mayor (H4 o diario) para saber la dirección, y solo después baja al H1 para elegir el momento. Ir contra la dirección del gráfico mayor es remar contra la marea con un remo de plástico.

:::nota
Primero el mapa (H4 o D1). Después la calle (H1). Nunca al revés.
:::

:::historia A Marta, dia 6
Tras un turno de noche, Marta abrió el EURUSD en M1 y vio siete «oportunidades» en veinte minutos. Cada vela verde le parecía el inicio de una subida, cada roja el fin del mundo. Se acordó de la nota adhesiva, cambió al H4 y se quedó mirando. En cuatro días, el precio había hecho tres mínimos cada vez más altos. Las siete oportunidades del M1 eran solo ruido dentro de una subida tranquila. Cerró la app y se fue a dormir.
:::

## Soporte y resistencia son zonas, no líneas

**Soporte** es una zona donde el precio ha dejado de caer. **Resistencia** es una zona donde ha dejado de subir. Dibújalas como franjas, no como líneas finas: el precio rara vez respeta un número exacto al pip.

1. En el gráfico H4, busca dos o tres sitios donde el precio ha invertido más de una vez.
2. Dibuja un rectángulo que abarque las mechas y los cuerpos de esa zona.
3. Repite por encima y por debajo del precio actual. Dos zonas a cada lado bastan.

Cuando una resistencia se rompe con fuerza, muchas veces pasa a funcionar como soporte, y viceversa. Pero «muchas veces» no es «siempre», y por eso existe el stop.

### En la pantalla: dibujar la zona

En el móvil, los dibujos se llaman **objetos** y están en el icono de las formas, arriba del gráfico.

1. Toca el icono de objetos y elige **Rectángulo**.
2. Toca una esquina de la zona y arrastra hasta la esquina opuesta.
3. Para afinar, toca el dibujo y arrastra los puntos. Para cambiar el color o borrarlo, mantén el dedo encima.
4. Elige siempre el mismo color para los soportes y otro para las resistencias. Dentro de un mes lo agradecerás.

:::galeria Dibujar y afinar
mt5-tel-objetos.png | La lista de objetos dibujados, por par. Desde aquí los editas, ocultas o borras.
mt5-tel-fibonacci.png | Las propiedades de un Fibonacci: puntos, niveles, color y estilo.
:::

## Fibonacci, sin misticismo

La herramienta de retroceso de Fibonacci marca niveles porcentuales de una corrección: 38,2 %, 50 % y 61,8 % son los más usados. Las matemáticas vienen de la sucesión de Fibonacci, pero el motivo por el que a veces funciona es más sencillo: mucha gente mira los mismos niveles.

1. En una tendencia alcista, une el fondo con el máximo del último movimiento (en el móvil: objetos › **Retroceso de Fibonacci**).
2. MT5 dibuja los niveles. Fíjate si alguno coincide con una zona de soporte que ya habías dibujado.
3. La coincidencia entre zona y nivel es un sitio interesante para planear una entrada. Un nivel solo, no.

[[foto: mt5-analise-tecnica.jpg | En el ordenador, las herramientas de Fibonacci están en el menú «Insertar › Objetos › Fibonacci». Varios gráficos y temporalidades lado a lado: aquí es donde la pantalla grande ayuda. Imagen: MetaQuotes (metatrader5.com). | larga]]

:::post @ricardogarciapt
imagem: Dibuja el mapa antes de salir de casa.
legenda: Zonas marcadas el domingo, plan escrito, órdenes pendientes en su sitio. Durante la semana, el mercado viene a ti. O no viene, y también está bien.
:::

## Indicadores: como máximo uno

Los indicadores están en el botón ***f*** arriba del gráfico. MT5 trae decenas, ordenados por familias: tendencia (medias móviles, bandas), osciladores (RSI, estocástico, MACD), volúmenes. Incluso puedes poner varios en la misma ventana.

:::galeria El botón f
mt5-tel-indicadores.png | En el botón f eliges el indicador por familias: tendencia, osciladores, volúmenes.
:::

Saber dónde están no quiere decir usarlos todos.

:::alerta Error clásico · Llenar el gráfico de indicadores
RSI, MACD, tres medias móviles, bandas, estocástico. La pantalla se convierte en un árbol de Navidad y la decisión se vuelve más difícil, no más fácil, porque siempre hay un indicador que dice que sí y otro que dice que no. Eliges el que te da la razón. Eso es sesgo de confirmación con luces. En el método frío, el gráfico tiene velas, zonas y, como máximo, una herramienta.
:::

Si quieres probar uno, elige una media móvil simple en el H4, solo para ver la dirección. Para quitar un indicador, mantén el dedo encima y elige borrar (en el PC: botón derecho › Lista de indicadores).

## Lo que los scanners hacen por ti

En MoreThanMoney usamos scanners que marcan automáticamente zonas, tendencia y posibles entradas. Un scanner no decide por ti: te ahorra tiempo al dibujar y te ayuda a no ver lo que no está. La regla sigue igual: entrada, stop, objetivo y lote salen de tu plan. En «Lo Destruí Todo. Y Menos Mal.» explico con detalle la lectura por regresión de tendencia que uso. Aquí queda lo esencial: una buena herramienta en manos de quien no tiene reglas sigue siendo solo una herramienta.

## De mi vida: leer el terreno, no adivinar

Después de la rodilla, hice unos dos años de contrato en caballería, y luego la vida civil me llevó a restaurantes, almacenes y logística. Hacia 2007 estaba en paro y me presenté a todo lo que pudiera devolverme un uniforme: paracaidistas otra vez, rangers, operaciones especiales, policía aérea y los Fuzileiros (infantería de marina). Entré en los Fuzileiros sin saber nadar.

Nadie me dio una bola de cristal para atravesar aquel curso. Me dieron un mapa: pruebas, horarios, pistas, patrones que se repetían. La pista de barro y la pista de combate tenían siempre los mismos puntos donde la gente se caía. Quien los conocía se preparaba para ellos. Entrené tres veces al día y mi nota de natación pasó de 9 a casi 20. Terminé el curso de nueve meses, a los 27 años, en el 12.º puesto.

Un gráfico es eso. No te dice lo que va a pasar. Te muestra dónde el terreno ya hizo caer o levantarse a la gente, y te deja decidir antes qué harás cuando llegues allí.

## La regla fría de este capítulo

:::cartao Regla fría n.º 4
Mapa primero: dirección en el H4, momento en el H1. Zonas, no líneas. Como máximo una herramienta en la pantalla.
:::

## En resumen

- El gráfico es un registro de dónde el precio cambió de dirección, no una bola de cristal.
- Una vela guarda cuatro precios: apertura, cierre, máximo y mínimo.
- La temporalidad cambia la historia: decide en el H4, afina en el H1, huye del M1.
- Máximos y mínimos te dicen la tendencia; soporte y resistencia se dibujan como zonas, con los objetos de la app.
- Fibonacci vale cuando coincide con una zona; solo, no.
- Indicadores en el botón *f*: como máximo uno.

:::exercicio Para hacer hoy
1. En tu par, abre el H4. Escribe la tendencia: alcista, bajista o lateral: ____________
2. Dibuja, con los objetos de la app, dos zonas de soporte y dos de resistencia.
3. Traza un Fibonacci en el último movimiento y mira si algún nivel coincide con una zona.
4. Cambia al M1 durante un minuto y luego vuelve al H4. Escribe lo que sentiste en cada uno: ____________
5. Haz una captura y guárdala en la carpeta «Diario». Escribe debajo: «Si el precio llega a ____, mi plan es ____».
:::
