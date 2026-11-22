# Instalar el MetaTrader sin tropezar

> La plataforma no te convierte en trader. Pero un botón pulsado por error puede hacerte perder el mes.

El MetaTrader 5 (MT5) es la plataforma donde vas a ver gráficos y abrir órdenes. Es gratuita, existe para móvil, ordenador y navegador, y la usan muchos brókeres del mundo. La app es de MetaQuotes. La cuenta es del bróker. Este detalle parece menor y no lo es: el MT5 es solo la ventana. El dinero, cuando exista, está en el bróker.

El primer objetivo de este capítulo es sencillo: tener el MetaTrader funcionando en una **cuenta demo**, en el móvil y en el ordenador, y saber dónde está cada cosa, antes de tocar dinero real.

[[foto: rg-telefone.jpg | Buena parte de mi trabajo de análisis empieza en el móvil. La regla es la misma que en el ordenador: plan antes, clic después. | lado]]

## ¿MT4 o MT5?

Vas a oír hablar de los dos. Son de la misma empresa, MetaQuotes, y hacen lo esencial de la misma manera: gráficos, órdenes con stop y objetivo, historial.

| | MetaTrader 4 | MetaTrader 5 |
|---|---|---|
| Edad | La versión antigua, todavía muy usada en Forex | La versión actual, con más mercados |
| Tipos de orden pendiente | 4 | 6 (añade Buy Stop Limit y Sell Stop Limit) |
| Temporalidades del gráfico | 9 | 21 |
| Calendario económico en la app | No | Sí |

Lo que importa de verdad: **una cuenta es de una sola plataforma.** Una cuenta MT5 no entra en MT4, ni al revés. Cuando abres cuenta, el bróker te pregunta cuál quieres. En este libro uso MT5. Si tu bróker solo tiene MT4, todo lo que hay aquí funciona igual; solo cambia el sitio de algún botón.

## En el móvil: instalar y entrar

1. Abre **Google Play** (Android) o la **App Store** (iPhone) y busca «MetaTrader 5» (o «MetaTrader 4»).
2. Comprueba que el desarrollador es **MetaQuotes**. Hay copias con nombres parecidos. Nunca instales la app desde un enlace que te envíen por mensaje.
3. Abre la app. La primera vez te ofrece una cuenta demo en un servidor de MetaQuotes. Sirve para echar un vistazo, pero lo ideal es la demo de tu bróker, con las mismas condiciones que la cuenta real.
4. Ve a **Ajustes › Nueva cuenta** (en MT4: **Ajustes › Nueva cuenta** o **Gestionar cuentas › +**) y escribe el nombre del bróker.
5. Elige el servidor. Los que llevan «Demo» en el nombre son de práctica. Los que llevan «Live» o «Real» son de dinero de verdad.
6. Toca **Abrir cuenta demo** y rellena los datos. O, si ya tienes cuenta, toca **Entrar con una cuenta existente** y escribe el número de cuenta, la contraseña y el servidor exactamente como vinieron en el email del bróker.
7. Elige un saldo **realista**. Si en el mundo real ibas a empezar con 500 €, la demo también es de 500 €.
8. Guarda el número de cuenta, la contraseña y el nombre del servidor en un sitio seguro, fuera del móvil.

:::alerta Error clásico · Entrenar con un saldo de fantasía
La demo viene muchas veces con 10.000 o 100.000 por defecto. Con ese saldo, un lote de 0,50 parece pequeño y una pérdida de 300 parece nada. Después pasas a una cuenta real de 500 € con los mismos hábitos. La demo solo te enseña algo si tiene el tamaño de tu vida.
:::

:::nota Si la contraseña no entra
Nueve de cada diez veces el problema es el servidor. «Broker-Demo» y «Broker-Live01» son servidores distintos. Copia el nombre del servidor del email, letra a letra.
:::

## En el ordenador: el terminal

El móvil basta para seguir el mercado y colocar una orden que ya tienes preparada. Para analizar con calma, la pantalla grande ayuda. El terminal de PC es la versión completa.

1. Descarga el terminal **desde la web de tu bróker** o desde la web oficial **metatrader5.com** (MT4: metatrader4.com). Hay versión para Windows y para Mac. Nunca desde webs de terceros.
2. Ejecuta el instalador y acepta las opciones por defecto. Al final, el terminal se abre solo.
3. Si se abre una ventana pidiendo abrir cuenta, ciérrala. Ve a **Archivo › Iniciar sesión en la cuenta de trading** (en inglés, *File › Login to Trade Account*) y escribe el número de cuenta, la contraseña y el servidor. La misma cuenta funciona en el móvil y en el PC a la vez.
4. En la esquina de abajo a la derecha tiene que aparecer la velocidad de conexión (por ejemplo «45 ms»). Si aparece «Sin conexión», el servidor o la contraseña están mal.

Los nombres de los menús cambian un poco según el idioma del terminal. Pongo también el nombre en inglés cuando ayuda.

La pantalla del terminal tiene cuatro zonas:

| Zona | Dónde está | Para qué sirve |
|---|---|---|
| **Observación del mercado** | Arriba a la izquierda | La lista de pares con venta y compra, como las Cotizaciones del móvil |
| **Navegador** | Abajo a la izquierda | Tus cuentas, los indicadores y los scripts |
| **Gráficos** | En el centro | Una pestaña por cada gráfico abierto |
| **Caja de herramientas** | Abajo | Operaciones, Historial, Diario y Alertas |

Para abrir una orden en el PC pulsas **F9** (o el botón **Nueva orden**). La ventana es la misma que en el móvil, con los mismos campos: tipo, volumen, precio, S/L y T/P.

:::cartao Atajos que ahorran clics
**F9** nueva orden · **Ctrl+M** observación del mercado · **Ctrl+T** caja de herramientas · **+ / −** acercar o alejar el gráfico · **F8** propiedades del gráfico
:::

## Móvil y PC hablando entre sí

Puedes recibir en el móvil las alertas que pusiste en el PC. En la app, en **Ajustes › Mensajes**, encuentras tu **MetaQuotes ID**, un código de ocho caracteres. En el terminal, ve a **Herramientas › Opciones › Notificaciones** (*Tools › Options › Notifications*), activa las notificaciones push y pega ese código. A partir de ahí, una alerta de precio creada en el PC llega al móvil, aunque el ordenador esté lejos.

Esto ayuda con la regla de este libro: dejas la orden y las alertas preparadas en el PC y no te quedas mirando la pantalla.

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

*Las pantallas reales de la app, organizadas por temas, están en la **Guía visual de MetaTrader 5**, al final del libro.*


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
- Una cuenta es de una sola plataforma: MT4 o MT5.
- Instala solo desde la tienda oficial, la web del bróker o la web de MetaQuotes.
- Abre una demo con un saldo igual al que usarías en la vida real.
- Aprende las cinco pestañas: Cotizaciones, Gráfico, Operaciones, Historial y Ajustes.
- Mira el capital, no el saldo, cuando tienes posiciones abiertas.
- Antes de la cuenta real, las cuatro preguntas: regulación, entidad, costes, retiradas.

:::exercicio Para hacer hoy
1. Instala el MT5 en el móvil y en el ordenador y abre una cuenta demo con un saldo realista: ____________ €
2. Entra con la misma cuenta en los dos. Servidor: ____________
3. Añade a Cotizaciones el par que elegiste en el capítulo 1.
4. Pon el gráfico en velas, H1, sin indicadores. Haz una captura y guárdala en una carpeta llamada «Diario».
5. En la pestaña Operaciones, anota tu saldo, capital y margen libre: ____________
:::
