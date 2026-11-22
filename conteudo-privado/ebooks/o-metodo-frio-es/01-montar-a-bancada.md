# Montar el banco de trabajo

> La plataforma no te convierte en trader. Pero un botón pulsado por error puede hacerte perder el mes.

Nadie aprende carpintería leyendo sobre la madera. Primero se monta el banco, se colocan las herramientas en su sitio y solo después se corta la primera tabla. En este libro es igual. Antes de hablar de mercado, de pips o de órdenes, vas a tener MetaTrader instalado en una **cuenta demo**, en el móvil y en el ordenador, y vas a saber dónde está cada botón. A partir de aquí, cada capítulo trae una idea nueva y la pantalla de la app donde se aplica.

MetaTrader 5 (MT5) es la plataforma donde vas a ver gráficos y abrir órdenes. Es gratuita, existe para móvil, ordenador y navegador, y la usan muchos brókeres del mundo. La app es de MetaQuotes. La cuenta es del bróker. Esta distinción parece un detalle y no lo es: MT5 es solo la ventana. El dinero, cuando exista, está en el bróker.

[[foto: rg-telefone.jpg | Gran parte de mi trabajo de análisis empieza en el móvil. La regla es la misma que en el ordenador: plan antes, clic después. | lado]]

:::historia A Marta, dia 1
Marta tiene 34 años y trabaja por turnos en un hospital. En un descanso, recibe por WhatsApp un mensaje de un conocido de un conocido: «Instálala por este enlace, es la versión pro de MetaTrader». Casi lo pulsa. Luego se acordó de una frase que había leído: la app de verdad está en la tienda oficial y el programador se llama MetaQuotes. Borró el mensaje y fue a Google Play. Fue la primera regla fría que cumplió sin saber que lo era.
:::

*Marta es un personaje de ejemplo, construido a partir de las dudas que escucho cada semana a quien empieza. La acompañarás hasta el final del libro.*

## ¿MT4 o MT5?

Vas a oír hablar de las dos. Son de la misma empresa y hacen lo esencial de la misma manera: gráficos, órdenes con stop y objetivo, historial.

| | MetaTrader 4 | MetaTrader 5 |
|---|---|---|
| Edad | La versión antigua, todavía muy usada en Forex | La versión actual, con más mercados |
| Tipos de orden pendiente | 4 | 6 (añade Buy Stop Limit y Sell Stop Limit) |
| Periodos del gráfico | 9 | 21 |
| Calendario económico en la app | No | Sí |

Lo que de verdad importa: **una cuenta es de una sola plataforma.** Una cuenta MT5 no entra en MT4 y al revés tampoco. Cuando abres cuenta, el bróker te pregunta cuál quieres. En este libro uso MT5. Si tu bróker solo tiene MT4, todo lo que aquí aparece funciona igual; solo cambia el sitio de uno que otro botón.

## En el móvil: instalar y entrar

1. Abre **Google Play** (Android) o la **App Store** (iPhone) y busca «MetaTrader 5» (o «MetaTrader 4»).
2. Confirma que el programador es **MetaQuotes**. Hay copias con nombres parecidos. Nunca instales la app desde un enlace enviado por mensaje.
3. Abre la app. La primera vez ofrece enseguida una cuenta demo en un servidor de la propia MetaQuotes. Sirve para echar un vistazo, pero lo ideal es la demo de tu bróker, con las mismas condiciones que la cuenta real.
4. Ve a **Ajustes › Nueva cuenta** y escribe el nombre del bróker.
5. Elige el servidor. Los que tienen «Demo» en el nombre son de entrenamiento. Los que tienen «Live» o «Real» son de dinero de verdad.
6. Toca **Abrir cuenta demo** y rellena los datos. O, si ya tienes cuenta, **Iniciar sesión con una cuenta existente** y escribe el número de cuenta, la contraseña y el servidor exactamente como llegaron en el correo del bróker.
7. Elige un saldo **realista**. Si en el mundo real ibas a empezar con 500 €, la demo también es de 500 €.
8. Guarda el número de cuenta, la contraseña y el nombre del servidor en un sitio seguro, fuera del móvil.

:::galeria La primera pantalla que visitar
mt5-tel-conta.png | En Ajustes: la cuenta, Nueva cuenta, las noticias, el calendario (Tradays) y los ajustes de los gráficos.
:::

:::alerta Error clásico · Entrenar con un saldo de fantasía
La demo viene muchas veces con 10.000 o 100.000 por defecto. Con ese saldo, un lote de 0,50 parece pequeño y una pérdida de 300 parece nada. Luego pasas a una cuenta real de 500 € con los mismos hábitos. La demo solo te enseña algo si tiene el tamaño de tu vida.
:::

:::nota Si la contraseña no entra
Nueve de cada diez veces el problema es el servidor. «Bróker-Demo» y «Bróker-Live01» son servidores distintos. Copia el nombre del servidor del correo, letra a letra.
:::

:::historia A Marta, dia 1, por la noche
La demo se abrió con 100 000 por defecto. Marta la borró y abrió otra con 500 €, el dinero que algún día admite usar. La contraseña no entró a la primera: había elegido el servidor «Live». Cambió a «Demo» y entró. Escribió los tres datos en una libreta que ya tiene con la portada «Mi método».
:::

## La barra de abajo: cinco botones

Todo en MT5 del móvil empieza en la barra de abajo. Aprende los cinco botones en el orden en que los vas a usar en este libro:

[[foto: mt5-tel-trio.png | Cotizaciones, gráfico y ventana de orden: las tres pantallas donde vas a pasar casi todo el tiempo. Capturas reales de la app, en una cuenta de ejemplo. | larga]]

| Botón | Para qué sirve | Dónde lo profundizamos |
|---|---|---|
| **Cotizaciones** (flechas) | La lista de pares, con el precio de venta y el de compra | Capítulo 2 |
| **Gráfico** (velas) | El gráfico del par elegido, con temporalidades, indicadores y dibujos | Capítulo 4 |
| **Operaciones** (línea) | Las posiciones abiertas, el saldo, el capital y el margen | Capítulo 6 |
| **Historial** (reloj) | Lo que ya se cerró: de aquí sale el diario | Capítulo 9 |
| **Ajustes** (rueda dentada) | Cuentas, mensajes, noticias, calendario y preferencias | Este capítulo y el 7 |

:::nota Si te pierdes
Toca Cotizaciones. Es el punto de partida de casi todo, como la puerta de casa.
:::

## Ordenar el gráfico antes de usarlo

Un banco desordenado te hace coger la herramienta equivocada. Antes de abrir un solo gráfico, ve a **Ajustes › Gráficos** y déjalo así:

- **Velas japonesas** (no líneas ni barras), porque muestran apertura, cierre, máximo y mínimo de cada temporalidad. En el capítulo 4 aprendes a leerlas.
- **Línea Ask** activada, para ver el precio de compra y, a ojo, el spread.
- **Cuenta atrás para el cierre de la vela** activada, para no decidir a mitad de una vela.
- **Ningún indicador**, por ahora. Sí, ninguno. En el capítulo 4 explico por qué.
- **Un esquema de colores** elegido una vez. Después no lo toques más.

:::galeria Menos ruido, más lectura
mt5-tel-definicoes-grafico.png | Ajustes › Gráficos: velas japonesas y lo que aparece en pantalla.
mt5-tel-cores.png | Los colores de cada parte del gráfico. Elige un esquema y olvida el asunto.
:::

:::post @ricardogarciapt
imagem: Gráfico limpio. Cabeza limpia.
legenda: Doce indicadores en pantalla no te dan doce confirmaciones. Te dan doce excusas. Empieza con velas y dos zonas dibujadas a mano.
:::

## En el ordenador: el terminal

El móvil basta para seguir el mercado y para colocar una orden preparada. Para analizar con calma, la pantalla grande ayuda. El terminal de PC es la versión completa.

1. Descarga el terminal **desde la web de tu bróker** o desde la web oficial **metatrader5.com** (MT4: metatrader4.com). Hay versión para Windows y para Mac. Nunca de webs de terceros.
2. Ejecuta el instalador y acepta las opciones por defecto. Al final, el terminal se abre solo.
3. Si aparece una ventana pidiendo abrir cuenta, ciérrala. Ve a **Archivo › Conectarse a una cuenta comercial** (en inglés, *File › Login to Trade Account*) y escribe el número de cuenta, la contraseña y el servidor. La misma cuenta funciona en el móvil y en el PC a la vez.
4. En la esquina inferior derecha tiene que aparecer la velocidad de la conexión (por ejemplo «45 ms»). Si aparece «Sin conexión», el servidor o la contraseña están mal.

Los nombres de los menús varían un poco según el idioma que elijas en el terminal (a menudo viene en portugués de Brasil). Pongo también el nombre en inglés cuando ayuda.

La pantalla del terminal tiene cuatro zonas:

| Zona | Dónde está | Para qué sirve |
|---|---|---|
| **Observación del mercado** | A la izquierda, arriba | La lista de pares con venta y compra, como las Cotizaciones del móvil |
| **Navegador** | A la izquierda, abajo | Tus cuentas, los indicadores y los scripts |
| **Gráficos** | En el centro | Una pestaña por cada gráfico abierto |
| **Caja de herramientas** | Abajo | Operaciones, Historial, Diario, Alertas y Calendario |

:::cartao Atajos que ahorran clics
**F9** nueva orden · **Ctrl+M** observación del mercado · **Ctrl+T** caja de herramientas · **+ / −** acercar o alejar el gráfico · **F8** propiedades del gráfico
:::

## Móvil y PC hablando entre sí

Puedes recibir en el móvil las alertas que pongas en el PC. En la app, en **Ajustes › Mensajes**, encuentras tu **MetaQuotes ID**, un código de ocho caracteres. En el terminal, ve a **Herramientas › Opciones › Notificaciones** (*Tools › Options › Notifications*), activa las notificaciones push y pega ese código. Para probar, pulsa **Probar**: el mensaje tiene que llegar al móvil en segundos.

Hazlo hoy, aunque todavía no entiendas para qué sirve. En el capítulo 7 usarás estas alertas para dejar de mirar la pantalla esperando a que llegue el precio.

## De mi vida: el patio del abuelo

Mi abuelo adoptivo era severo. Cuando hacía una tontería, me tiraba la chancla. Pero enseguida llegaba la otra mitad de él: «Anda, cálzate y vente conmigo.» Y nos íbamos al patio, junto a los escombros de un edificio que habían derribado. Gallinas, huertos, la azada en su sitio, la regadera en su sitio. Era su válvula de escape, y fue mi primera escuela de método.

Durante el día trabajaba en la tienda de ultramarinos Vilares, en Oporto. Bacalao colgado, chorizos en fila, olor a sal y a embutidos ahumados, clientes que entraban con un «¡Oye Evaristo, tienes de esto?», como en una vieja película portuguesa. Nada estaba fuera de sitio, porque en una tienda llena quien no ordena no encuentra nada.

Cuando murió, aguanté en el funeral. No lloré. Días después, en un café con una mesa de billar, me quedé mirando las bolas quietas sobre el paño verde, y se me vino todo encima: había perdido a la persona que me sostenía, que me reñía y que me daba un camino. Hoy, cuando ordeno mi puesto de trabajo antes de abrir un gráfico, todavía oigo su voz: cada cosa en su sitio, y solo después se trabaja.

## La regla fría de este capítulo

:::cartao Regla fría n.º 1
La demo tiene el tamaño de mi vida real. El mismo saldo, los mismos lotes, las mismas horas. Si no es en serio en la demo, no lo será en la real.
:::

## En resumen

- MT5 es la ventana; la cuenta y el dinero están en el bróker.
- Una cuenta es de una sola plataforma: MT4 o MT5.
- Instala solo desde la tienda oficial, la web del bróker o la web de MetaQuotes.
- Abre una demo con un saldo igual al que usarías en la vida real.
- Cinco botones: Cotizaciones, Gráfico, Operaciones, Historial y Ajustes.
- Gráfico ordenado antes de usarlo: velas, línea Ask, ningún indicador.
- Móvil y PC conectados por el MetaQuotes ID.

:::exercicio Para hacer hoy
1. Instala MT5 en el móvil y en el ordenador y abre una cuenta demo con un saldo realista: ____________ €
2. Entra con la misma cuenta en los dos. Servidor: ____________
3. En Ajustes › Gráficos, pon velas japonesas, línea Ask y ningún indicador.
4. Conecta el PC al móvil con el MetaQuotes ID y haz la prueba de notificación.
5. Crea una carpeta llamada «Diario». En el capítulo 9 entenderás por qué.
:::
