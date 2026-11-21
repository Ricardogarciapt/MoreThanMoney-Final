# Cómo leo un gráfico

> Un gráfico no te dice lo que va a pasar. Te dice dónde ha estado ya el precio, y eso es más de lo que mira la mayoría de la gente.

Quien mira por primera vez un gráfico de precios ve velas verdes y rojas subiendo y bajando, y nada más. Parece un electrocardiograma sin médico. La mayor parte de lo que se ve es ruido, y el trabajo consiste en separar el ruido de lo que se repite.

Este capítulo trata de la herramienta que más uso para ello: la regresión de tendencia. No te voy a pedir que creas en nada. Voy a explicar la idea de forma que puedas probarla tú, en papel, antes de verla en una pantalla con dinero de por medio.

## Empezar por el café

Imagina que vas todas las mañanas a un café de Oporto y que pagas, de media, 1,20 €. Un día pagas 1,25 €. Al otro, 1,18 €. Una semana, hay un día en que cobran 1,80 €. Te parece raro, ¿verdad? No es normal. Sabes que el café «suele» costar 1,20 €, y que las desviaciones alrededor de ese valor son pequeñas.

Ahora imagina que, al mes siguiente, el local sube el precio a 1,50 € y se queda ahí. Ese nuevo nivel ya no es una desviación: es un nuevo normal. Tu referencia tiene que cambiar. Este ejemplo tiene las dos ideas que sostienen todo lo demás: existe una media alrededor de la cual oscila el precio, y esa media puede cambiar.


:::curso Lección 301 · Qué es una vela
Cada vela resume lo que el precio hizo en un periodo: un minuto, una hora, un día. Tiene cuatro puntos.

- **Apertura y cierre:** el cuerpo de la vela.
- **Máximo y mínimo:** las mechas, hacia arriba y hacia abajo.
- ¿Cerró por encima de donde abrió? Es alcista. ¿Por debajo? Es bajista.

Una vela sola dice poco. Diez velas seguidas ya cuentan una historia: quién mandaba, y si empezó a cansarse.

en el curso: lees velas reales del oro, una a una, antes de ver ningún indicador.
:::

## La línea media

Una regresión lineal es una forma matemática de encontrar la recta que mejor se ajusta a una serie de puntos. En un gráfico de precios, esa recta muestra la dirección general del movimiento y funciona como un «centro» alrededor del cual oscila el precio.

No necesitas saber la fórmula para entender la idea. Imagina que pones una regla sobre el gráfico, de forma que los puntos queden más o menos equilibrados a los dos lados. La recta que queda es la línea media.

Para practicar, haz el ejercicio de abajo. Usa valores hipotéticos, sin ninguna relación con mercados reales.

:::exercicio Calcular la media a mano
Ejemplo ilustrativo: diez valores de un producto, en euros, a lo largo de diez días.

| Día | Valor |
|---|---|
| 1 | 10,00 |
| 2 | 10,20 |
| 3 | 10,10 |
| 4 | 10,40 |
| 5 | 10,30 |
| 6 | 10,60 |
| 7 | 10,50 |
| 8 | 10,70 |
| 9 | 10,60 |
| 10 | 10,90 |

1. Suma los diez valores. Resultado: 104,30 €.
2. Divide entre 10. Media: 10,43 €.
3. Marca en el gráfico de papel los diez puntos y traza una recta horizontal en 10,43 €.
4. Fíjate en cuántos puntos quedan por encima y cuántos por debajo. La recta te da una referencia, no una predicción.

Día en que el valor se alejó más de la media: ____________
Cuánto estaba alejado: ____________
:::

[[foto: rg-ecras.jpg | Frente a la pantalla, revisando gráficos antiguos. El trabajo más aburrido es el que más enseña. | polaroid]]

## La goma elástica

Aquí la imagen de la goma elástica ayuda. Piensa en la línea media como un punto atado a una goma. Cuando el precio se aleja mucho, la goma se estira y lo devuelve hacia el centro. Cuanto más se aleja, mayor es la tensión.

Los analistas de regresión suelen dibujar dos bandas paralelas a la línea, separadas por un múltiplo de la desviación típica. Esas bandas te dicen cuándo el alejamiento es inusual. Cuando el precio toca una banda, la pregunta no es «¿va a volver?», sino «¿qué ha cambiado para que se aleje tanto?».

:::destaque
La regresión mide el alejamiento respecto a un centro. No mide la razón de ese alejamiento, y no garantiza que el precio vuelva.
:::

Esta distinción lo es todo. Una goma puede quedarse estirada mucho tiempo si el suelo cambia debajo de ella. En el café del ejemplo, el precio nunca volvió a 1,20 €, porque el local cambió de política. En los mercados pasa lo mismo: una noticia económica, una decisión de un banco central o un cambio de ánimo colectivo pueden desplazar la media, y tu regla se queda desactualizada.

:::historia
Ejemplo ilustrativo. Una persona ve el precio alejado de la línea y decide que «tiene que volver». Espera, luego espera más, y la cuenta crece en su contra. La línea media no falló. Falló la creencia de que la línea es una promesa.
:::

:::nota
Antes de mirar el gráfico:
• Tendencia de arriba: ¿sube, baja o está lateral?
• ¿Estoy lejos o cerca de la línea media?
• ¿Hay noticias fuertes hoy?
:::

## Qué hace un scanner

La idea de un scanner, como el Scanner GoldKiller que tenemos en TradingView, es automatizar el trabajo repetitivo: aplicar la misma regla de lectura a todo el gráfico y señalar cuando el precio entra en una zona que esa regla considera inusual. Te ahorra hacer las cuentas a mano, y sobre todo te ahorra mirar el gráfico todo el día. Los detalles técnicos de cada indicador están en la documentación del producto, y conviene leerlos antes de confiar en él.

Lo que el scanner no hace es decidir por ti. Una alerta es información, no una orden. Antes de cualquier decisión, sigues teniendo que responder a cuatro preguntas: cuál es el contexto (¿hay noticias importantes hoy?), cuál es tu plan (dónde entras, dónde sales si te equivocas), cuánto estás dispuesto a perder (eso es el capítulo 8) y si estás en condiciones emocionales de seguir el plan.

:::alerta
Un scanner que señala mucho no es mejor por señalar mucho. Si la señal aparece sin contexto, leerla como una garantía es un error. Ninguna herramienta sustituye tu lectura del riesgo.
:::

:::post @morethanmoney.pt
imagen: Un scanner no decide por ti. Te muestra dónde mirar.
legenda: Herramientas como el Scanner GoldKiller ayudan a filtrar el ruido. La decisión, el riesgo y la responsabilidad siguen siendo tuyos. Contenido educativo.
:::

:::curso Lección 409 · Temporalidades
El mismo mercado parece otro según el gráfico que abras. En el de 5 minutos parece un caos. En el diario parece una línea tranquila.

- **Gráfico mayor** (diario o 4 horas): te dice la dirección.
- **Gráfico medio** (1 hora): te muestra la estructura.
- **Gráfico menor** (15 minutos): es donde eliges el momento de entrar.

La regla que más repito: **el gráfico mayor decide la dirección, el menor decide el momento.** Quien vende en el de 5 minutos contra una subida en el diario va nadando contra la corriente, y se cansa antes.

en el curso: haces el mismo análisis en tres gráficos a la vez, con la regresión del inicio de este capítulo.
:::

## Leer sin engañarte

Hay tres errores que veo repetirse en quien empieza a leer gráficos:

| Error | Qué hacer en su lugar |
|---|---|
| Ver patrones en todas partes | Definir de antemano qué cuenta como patrón y cuántas veces lo has visto |
| Usar la línea como objetivo | Usar la línea como referencia y definir la salida antes de entrar |
| Cambiar el periodo hasta que la historia encaje | Elegir un periodo y mantenerlo durante semanas |

El último es el más traicionero. Si cambias el periodo de análisis hasta encontrar la línea que te da la razón, no estás leyendo el gráfico. Estás haciendo que te confirme lo que ya pensabas.

:::destaque
Contenido educativo, no es asesoramiento financiero. Leer gráficos no garantiza resultados, y el riesgo de pérdida es real.
:::

:::cartao Leer un gráfico en 5 pasos
1. Gráfico de arriba: ¿cuál es la tendencia?
2. ¿Dónde está el precio respecto a la media?
3. ¿La goma está estirada o relajada?
4. ¿Dónde estaría mi stop?
5. Si no lo veo claro, no entro.
:::

## En resumen

- La regresión de tendencia traza una línea media alrededor de la cual oscila el precio, y esa media puede cambiar.
- Las bandas muestran alejamientos inusuales, no garantías de regreso.
- Un scanner automatiza la lectura, pero la alerta es información y no una orden.
- Antes de actuar necesitas contexto, un plan escrito y un límite de pérdida.
- El mayor error es cambiar la ventana o la regla hasta que el gráfico confirme tu opinión.

[[grafico:regressao-tendencia]]

## Tu misión de esta semana

Coge un gráfico de un activo que te interese (un par de divisas o el oro, en cuenta demo o en papel), traza a mano una línea media para los últimos 20 periodos y escribe, en una hoja, cuántas veces el precio quedó por encima y cuántas por debajo. No saques conclusiones. Limítate a observar.
