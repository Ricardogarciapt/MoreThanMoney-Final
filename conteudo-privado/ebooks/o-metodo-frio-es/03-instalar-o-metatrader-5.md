# Instalar el MetaTrader 5 sin tropezar

> La plataforma no te convierte en trader. Pero un botón pulsado por error puede hacerte perder el mes.

El MetaTrader 5 (MT5) es la plataforma donde vas a ver gráficos y abrir órdenes. Es gratuita, existe para móvil, ordenador y navegador, y la usan muchos brókeres del mundo. La app es de MetaQuotes. La cuenta es del bróker. Este detalle parece menor y no lo es: el MT5 es solo la ventana. El dinero, cuando exista, está en el bróker.

El primer objetivo de este capítulo es sencillo: tener el MT5 funcionando en una **cuenta demo** y saber dónde está cada cosa, antes de tocar dinero real.

[[foto: rg-telefone.jpg | Buena parte de mi trabajo de análisis empieza en el móvil. La regla es la misma que en el ordenador: plan antes, clic después. | lado]]

## Paso a paso en el móvil

1. Instala la app **MetaTrader 5** desde la App Store o Google Play. Comprueba que el desarrollador es MetaQuotes.
2. Abre la app y elige **Abrir cuenta demo** (o «Gestionar cuentas» y luego el «+»).
3. Busca el servidor de tu bróker. Si todavía no tienes bróker, en la propia lista hay servidores de demostración.
4. Rellena los datos de la cuenta demo y elige un saldo **realista**. Si en el mundo real ibas a empezar con 500 €, la demo también es de 500 €. Entrenar con 100.000 ficticios te enseña a ser descuidado.
5. Guarda el número de cuenta y la contraseña en un lugar seguro.

:::alerta Error clásico · Entrenar con un saldo de fantasía
La demo suele venir con 10.000 o 100.000 por defecto. Con ese saldo, un lote de 0,50 parece pequeño y una pérdida de 300 no parece nada. Luego pasas a una cuenta real de 500 € con los mismos hábitos. La demo solo te enseña algo si tiene el tamaño de tu vida.
:::

## Las cinco pestañas que importan

La app tiene cinco pestañas en la parte inferior de la pantalla. Aprende en el orden en que las vas a usar:

| Pestaña | Para qué sirve |
|---|---|
| **Cotizaciones** | La lista de pares. Toca uno para ver detalles o abrir una orden. |
| **Gráfico** | El gráfico del par elegido, con velas, temporalidades y herramientas de dibujo. |
| **Operaciones** | El saldo, el capital, el margen y las posiciones abiertas. |
| **Historial** | Todas las operaciones cerradas, con resultado. Es la materia prima de tu diario. |
| **Mensajes / Ajustes** | Notificaciones, cuentas y preferencias. |

[[foto: mt5-android-negociacao.jpg | La pestaña de operaciones y el historial en el MetaTrader 5 para Android y tablet. Aquí ves el saldo, el capital y el margen. Imagen: MetaQuotes (metatrader5.com). | larga]]

En una cuenta demo recién abierta con 500 €, la pestaña «Operaciones» muestra saldo 500,00 €, capital 500,00 €, margen 0,00 € y margen libre 500,00 € (valores ilustrativos).

**Saldo** es el dinero sin contar las posiciones abiertas. **Capital** (equity) es el saldo más o menos lo que las posiciones abiertas están ganando o perdiendo. Cuando tienes una operación abierta, mira siempre el capital: ese es el número real.

## Ordenar el gráfico (menos es más)

Toca el gráfico y déjalo así:

- **Velas** (no líneas ni barras), porque muestran apertura, cierre, máximo y mínimo de cada periodo.
- **Temporalidad** de trabajo: empieza en H1 (una vela por hora) y usa H4 o D1 para ver la dirección mayor.
- **Ningún indicador**, de momento. Sí, ninguno. En el capítulo 5 explico por qué.
- **Línea del precio de compra** visible, para ver el spread a ojo.

:::post @ricardogarciapt
imagen: Gráfico limpio. Cabeza limpia.
legenda: Doce indicadores en la pantalla no te dan doce confirmaciones. Te dan doce excusas. Empieza con velas y dos zonas dibujadas a mano.
:::

## Bróker: las cuatro preguntas antes de abrir cuenta

Cuando pases de la demo a la cuenta real (y solo pasas en el capítulo 11), hazte estas cuatro preguntas:

1. **¿Quién me regula?** Busca la entidad y el número de licencia en la web del regulador, no solo en la web del bróker.
2. **¿Qué entidad se queda con mi cuenta?** Muchos grupos tienen varias entidades en países distintos, con reglas distintas.
3. **¿Cuánto cuesta?** Spread típico, comisiones, swap, costes de retirada.
4. **¿Puedo retirar?** Lee las normas de retirada antes de ingresar.

:::nota
La cuenta tiene que estar siempre a mi nombre. Si alguien me pide acceso, contraseña o un «poder» para operar por mí, la conversación termina ahí.
:::

## La regla fría de este capítulo

:::cartao Regla fría n.º 3
La demo tiene el tamaño de mi vida real. El mismo saldo, los mismos lotes, las mismas horas. Si en la demo no lo tomo en serio, en real tampoco lo voy a tomar en serio.
:::

## En resumen

- El MT5 es la ventana; la cuenta y el dinero están en el bróker.
- Abre una demo con un saldo igual al que usarías en la vida real.
- Aprende las cinco pestañas: Cotizaciones, Gráfico, Operaciones, Historial y Ajustes.
- Mira el capital, no el saldo, cuando tienes posiciones abiertas.
- Antes de la cuenta real, las cuatro preguntas: regulación, entidad, costes, retiradas.

:::exercicio Para hacer hoy
1. Instala el MT5 y abre una cuenta demo con un saldo realista: ____________ €
2. Añade a Cotizaciones el par que elegiste en el capítulo 1.
3. Pon el gráfico en velas, H1, sin indicadores. Haz una captura y guárdala en una carpeta llamada «Diario».
4. En la pestaña Operaciones, anota tu saldo, capital y margen libre: ____________
:::
