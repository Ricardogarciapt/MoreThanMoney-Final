# Perpetuos y apalancamiento

> El apalancamiento no crea dinero. Solo amplifica lo que ya estaba, incluidos los errores.

Este es el capítulo que dejé para cerca del final a propósito. Los perpetuos son muy distintos de comprar una moneda y guardarla. Cuando se los explico a alguien que acaba de empezar, mi preocupación número uno es que la persona entienda los riesgos antes de sentir la tentación de usarlos. Si estás leyendo esto al principio del libro, no pasa nada: puedes saltar al último capítulo y volver aquí más tarde.

:::post @morethanmoney.pt
imagem: El apalancamiento no perdona.
legenda: 100x parece poder. Es solo un precio de liquidación muy cerca. Si no sabes decir dónde lo pierdes todo, el apalancamiento no es para ti. Todavía.
:::

## Qué son los perpetuos

Un contrato perpetuo, o perpetuo, es un instrumento derivado. No compras la moneda. Apuestas a que el precio va a subir (long) o a que va a bajar (short), con un contrato que no tiene fecha de vencimiento. Para abrir una posición usas un margen, que es una fracción del valor total, y la plataforma te presta el resto. Eso es lo que crea el efecto de apalancamiento.

Un ejemplo sencillo. Si tienes 100 € y la plataforma te presta 900 € más, puedes mover un valor de 1.000 €. Si el mercado sube un 10 %, ganas 100 € sobre tus 100 €, es decir, un 100 %. Si baja un 10 %, pierdes los 100 € enteros. El mismo movimiento que te habría costado 10 € en una compra simple pasa a costarte todo.

:::destaque
El apalancamiento multiplica las ganancias y las pérdidas de la misma manera. La diferencia es que la pérdida puede ser total antes de que el mercado parezca haber hecho algo grave.
:::

## Liquidación: el momento en que la plataforma cierra la posición

Cuando la pérdida consume el margen que pusiste, la plataforma cierra la posición automáticamente. Se llama liquidación. No hay conversación, no hay periodo de espera, y muchas veces no hay opción de reaccionar.

[[grafico:alavancagem]]

Como aproximación, y sin contar comisiones, la liquidación se produce cerca de estos puntos: con 2× la posición se liquida cerca de una caída del 50 %; con 5×, cerca del 20 %; con 10×, cerca del 10 %; con 20×, cerca del 5 %; con 50×, cerca del 2 %; y con 100×, cerca del 1 %. Cuanto mayor es el apalancamiento, menor es el movimiento que te elimina. Un día normal de mercado en cripto puede tener oscilaciones de ese tamaño.

:::alerta
Con un apalancamiento alto, un movimiento pequeño y normal puede liquidar la posición. No hace falta una noticia catastrófica. Basta con una oscilación de un día.
:::

:::ecra Ejemplo · posición abierta (ilustrativo)
Margen: 100 €
Apalancamiento: 10×
Valor controlado: 1.000 €
Liquidación aproximada: caída de unos 10 %, sin comisiones
Estado: abierta
:::

:::curso Clase 8.2 · Perpetuos y apalancamiento
Con un apalancamiento de 10×, una caída del 10 % en tu contra puede borrar el margen entero de esa posición. No es teoría, es aritmética.

en el curso: haces la cuenta de la liquidación en tres ejemplos y entiendes por qué este es el último módulo, y no el primero.
:::

## Por qué no empezar por aquí

Yo no empezaría por los perpetuos. No es una prohibición, es una cuestión de orden. Primero entiendes la moneda, la cartera, la seguridad, la compra periódica y los impuestos. Después, si tiene sentido, estudias los derivados con más calma. Quien empieza por el final del camino suele perder dinero y confianza al mismo tiempo.

También hay un problema psicológico. Con apalancamiento, cada oscilación parece urgente. Empiezas a mirar el precio cada minuto, a hacer cuentas de cabeza y a decidir por impulso. Esa tensión sale cara.

:::conversa Telegram · Gonçalo
Gonçalo: Vi un vídeo de un tipo que hace 50x, ¡parece fácil!
eu: Antes de 50x, haz la cuenta de la liquidación. Con 50x, un movimiento de cerca del 2 % ya te cierra la posición.
Gonçalo: Ah... no había hecho esa cuenta.
:::

## Ejemplo ilustrativo: el mismo movimiento, dos realidades

**Ejemplo ilustrativo**, con valores inventados y redondos. Inés compra 100 € de una moneda al contado. El precio baja un 10 %. Se queda con 90 €, ha perdido 10 €, y puede esperar.

Tiago abre una posición de 100 € con 10× de apalancamiento, o sea, controla 1.000 €. El precio baja un 10 %. La pérdida es de 100 €, que es todo el margen. Se queda con cero, sin tiempo para decidir. Los dos vivieron el mismo movimiento de mercado y el resultado fue radicalmente distinto. Estas cifras sirven para ilustrar la lógica, no son una previsión ni un patrón.

:::cartao Antes de apalancar
- ¿Sé en qué precio se liquida la posición?
- ¿Puedo perder todo el margen sin que me afecte?
- ¿Estoy abriendo esto por impulso, o por un plan escrito?
- ¿Ya tengo claras las bases del libro (moneda, cartera, impuestos)?
:::

## Ejercicio: la cuenta de la liquidación

:::exercicio ¿Cuánto necesita el mercado para liquidarte?
1. Elige un margen hipotético, por ejemplo 100 €.
2. Elige un apalancamiento hipotético, por ejemplo 5×.
3. Calcula: 100 ÷ 5 = 20 %. Es la aproximación de cuánto necesita bajar el precio para liquidar la posición, sin contar comisiones.
4. Repite con 10× y con 20×. Escribe los tres resultados.
5. Pregúntate: si me despertara mañana con este movimiento, ¿cómo reaccionaría?

____________________________________________________________

____________________________________________________________
:::

## Una historia breve

:::historia
Caso ilustrativo: Gonçalo, 27 años, técnico de logística en Aveiro, vio un vídeo de alguien que ganaba mucho con perpetuos. Abrió una posición con apalancamiento alto, sin entender la liquidación. Un movimiento normal de mercado la cerró en minutos. No fue el fin del mundo, porque el importe era pequeño, pero fue una lección cara. Hoy enseña lo que aprendió a quien empieza.
:::

:::nota
Hoy: haz la cuenta del ejercicio con tus números hipotéticos y no abras ninguna posición, ni simulada, antes de haberla hecho.
:::

## En resumen

- Los perpetuos son derivados: apuestas con apalancamiento, sin fecha de vencimiento.
- El apalancamiento multiplica ganancias y pérdidas de la misma manera.
- La liquidación cierra la posición automáticamente cuando se agota el margen.
- Cuanto mayor es el apalancamiento, menor es el movimiento que te elimina.
- Para un principiante, el orden correcto es entender primero lo básico.

Contenido educativo, no constituye asesoramiento financiero. Con perpetuos puedes perder la totalidad del margen en muy poco tiempo.

## Para hacer hoy

1. Elige un margen hipotético de 100 € y un apalancamiento de 5×, y haz la cuenta de la liquidación.
2. Repite la cuenta con 10× y con 20×, y escribe los tres resultados en un papel.
3. Escribe la pregunta que te harías a ti mismo si te despertaras mañana con ese movimiento.
4. Si todavía sientes ganas de abrir una posición, espera una semana y vuelve a hacer la cuenta.
