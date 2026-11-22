# El WebTrader y las herramientas de la casa

> MetaTrader te enseñó la puerta. Ahora te enseño la casa que hemos construido para quien aprende.

Hasta aquí has usado MetaTrader 5, y has hecho bien. Es la plataforma que casi todos los brókeres ofrecen, y la vas a encontrar en cualquier sitio. Pero, a lo largo de estos años dando clases, he visto siempre los mismos tropiezos: el lote calculado de cabeza, el stop olvidado, el diario en una libreta aparte, el historial que nadie revisa, la gestión de la posición hecha a mano y con el corazón a mil.

Para eso MoreThanMoney construyó su propio **WebTrader**. Se abre en el navegador y en el móvil, sin instalar nada. Sirve la misma plataforma para tres tipos de cuenta: una **cuenta demo** para entrenar, las cuentas simuladas **MTM Funded** con reglas, y **tus cuentas del bróker** (TradeLocker y MetaTrader) conectadas a la misma pantalla. La regla fría del lote, el stop obligatorio, el diario y la revisión dejan de ser disciplina que tienes que recordar y pasan a estar dentro de la herramienta.

Para mí, aquí está el futuro del aprendizaje: el alumno aprende, entrena y opera en el mismo sitio donde el profesor ve lo que hizo, con los mismos números.

## De mi vida: dónde aprendí, y por qué hice distinto

Cuando decidí aprender trading, en plena crisis de 2021, pagué una plataforma de formación con una suscripción cara. No voy a decir el nombre. Aprendí cosas útiles allí, y la disciplina que traía de la vida militar hizo el resto. Pero recuerdo bien lo que costaba, a final de mes, para quien cobraba 1.037 €. Y recuerdo haber pensado que la mitad de la gente que necesitaba aquello nunca lo iba a poder pagar.

Unos seis meses después dejé mi «trabajo de ensueño». Hoy soy libre, estoy con mi familia, tengo inversiones (y también errores, que están todos en este libro) y no trabajo para nadie. Cuando fundé MoreThanMoney, me prometí dos cosas: que nadie iba a tener que pagar el precio de aprender solo, y que el precio de entrada no iba a ser lo que me cobraron a mí.

[[foto: rg-mentoria.jpg | Una conversación a la mesa vale más que cien vídeos vistos solo a las dos de la mañana. | lado]]

## Por qué MTM cuesta menos

No es caridad, es diseño. Hay tres razones, y todas son comprobables:

1. **Construimos las herramientas en casa.** El WebTrader, los scanners, las cuentas simuladas y la copia de estrategias son nuestros. No pagamos a terceros por cada alumno, así que no tenemos que trasladarte ese coste.
2. **El bróker paga parte de la cuenta.** Quien abre cuenta en un bróker colaborador y la valida puede tener acceso a Premium sin pagar la cuota mensual mientras la cuenta esté activa. Los planes y las condiciones siempre están actualizados en morethanmoney.pt.
3. **No vivimos de hacerte sentir pobre.** Nada de esquemas de reclutamiento, nada de pagar para subir de nivel, nada de capturas de beneficios para empujarte. El modelo es sencillo: herramientas, clases y comunidad por un precio que cabe en un sueldo portugués.

## Por qué no creo en aprender trading solo con YouTube gratis

También tenemos vídeos gratis en YouTube, y vas a ver los enlaces enseguida. Sirven para explicar cómo funciona cada herramienta. Lo que no creo es que se aprenda **trading** solo con vídeos gratis. Por cuatro razones:

- **El vídeo gratis se paga con tu atención.** El algoritmo premia lo que te engancha a la pantalla: la ganancia espectacular, la promesa, la prisa. Rara vez premia el vídeo aburrido sobre el tamaño del lote, que es lo que te salva la cuenta.
- **No hay orden.** Saltas de una estrategia a otra y nunca das 40 operaciones seguidas con el mismo plan.
- **Nadie ve tus errores.** Un vídeo no te dice que pusiste el stop en el sitio equivocado. Una persona y un historial compartido, sí.
- **Nadie responde por eso.** Quien no gana nada contigo tampoco pierde nada si te sale mal.

Gratis está genial para echar un vistazo. Para cambiar de vida necesitas método, herramientas y alguien que te vea trabajar.

## Entrar en el WebTrader

Abre **morethanmoney.pt/webtrader** en el ordenador o en el móvil. Entras con tu cuenta MTM (email, Google o PrimeVerse). Si solo tienes los datos de una cuenta simulada, hay una tercera puerta: **Entrar solo con credenciales de cuenta**, con el login, la contraseña y el servidor «MTM Funded», como en MetaTrader.

[[foto: wt-entrar.png | La pantalla de entrada del WebTrader: cuenta MTM, Google, PrimeVerse o solo las credenciales de la cuenta. | larga]]

Arriba, el **selector de cuentas** muestra todas tus cuentas en el mismo sitio: la demo, las cuentas MTM Funded y las cuentas del bróker que hayas conectado (TradeLocker o MetaTrader). Cambias de cuenta sin salir de la pantalla. Para este capítulo usé una cuenta de demostración con 1.000 $, el tamaño de una primera cuenta realista.

:::nota
En el móvil, el botón «Añadir a la pantalla de inicio» instala el WebTrader como una app. En iPhone: Compartir › Añadir a la pantalla de inicio.
:::

## Simple o Pro

El WebTrader tiene dos modos, y cambias entre ellos arriba (o con **Alt+M** en el ordenador):

| Modo | Para quién | Lo que ves |
|---|---|---|
| **SIMPLE** | Móvil, quien empieza | El gráfico a pantalla completa, SELL · volumen · BUY grandes abajo y un cajón con Posiciones, Órdenes, Historial y Más |
| **PRO** | Ordenador, quien ya analiza | Hasta 4 gráficos, la lista de símbolos, el ticket, el calendario y, abajo, Posiciones · Órdenes · Historial · Estadísticas · Diario · Alertas · Cuenta |

[[foto: wt-pro.jpg | El modo PRO: gráfico en el centro, lista y ticket a la derecha, posiciones e historial abajo. | larga]]

## Abrir una posición, paso a paso

Es el mismo método del capítulo 6, pero con la cuenta del riesgo hecha por ti.

1. **Elige el símbolo** en la lista (o toca el nombre del símbolo en el modo SIMPLE).
2. En el **ticket**, elige **Mercado** o **Pendiente** (Limit o Stop).
3. En lugar de escribir el lote, cambia el volumen a **Riesgo** y escribe **1 %** (o el valor en dólares). El WebTrader calcula el lote a partir de la distancia al stop.
4. Escribe el **SL** y el **TP**, o arrastra las líneas directamente en el gráfico. Escribir dibuja la línea; arrastrar la línea escribe el número. Nunca hay dos versiones de la misma orden.
5. Lee el resumen: dirección, entrada, stop, objetivo, lote, **riesgo en dinero y en porcentaje**, relación riesgo/beneficio y margen.
6. Pulsa **Confirmar**.

[[foto: wt-ticket.jpg | El ticket con el volumen en modo Riesgo: si mueves el stop, el lote se recalcula solo. | larga]]

:::alerta Error clásico · Activar la operación con un clic el primer día
El WebTrader tiene un modo «de un clic», como MetaTrader y TradingView: con él activado, tocar BUY envía la orden al momento. Es útil para quien ya tiene la mano entrenada. En el primer mes, déjalo desactivado. La confirmación es tu última comprobación antes de saltar.
:::

[[grafico:webtrader-ordem]]

## Gestión automática: lo que hace el motor por ti

Esta es la parte que MetaTrader en el móvil no te da. En cada posición tienes tres botones:

| Botón | Qué hace |
|---|---|
| **Auto BE** | Cuando el precio anda X pips a tu favor, el stop pasa a la entrada (con una pequeña ganancia, si quieres). A partir de ahí, la operación ya no te puede quitar dinero. |
| **Auto Trailing** | El stop sigue al precio a una distancia fija, solo a tu favor. Nunca retrocede. |
| **Trailing ya** | Activa el trailing desde ahora, a la distancia que elijas. |

En el bloque **Avanzado** del ticket puedes además dividir la salida en **TP1, TP2 y TP3**, cada uno con un porcentaje del volumen, mover el stop a la entrada cuando se alcanza el TP1 y poner caducidad a una orden pendiente.

Lo importante es **quién ejecuta**. En las cuentas MTM Funded y de demostración, es el motor de MTM, precio a precio, en un servidor. En tus cuentas del bróker (TradeLocker y MetaTrader), los mismos botones, con el mismo significado, quedan guardados y se ejecutan en el servidor de MTM. El navegador nunca mueve un stop de dinero real: si cierras la pestaña, la gestión no se detiene a mitad.

[[foto: wt-gestao.jpg | Una posición abierta con Auto BE y Auto Trailing. El stop sube solo, nunca baja. | larga]]

[[grafico:auto-be-trailing]]

:::historia Marta, día 26
Marta pasó la última semana de la demo al WebTrader. Abrió un Buy Limit en EURUSD con riesgo del 1 %, y el lote salió 0,04 sin hacer cuentas. Activó el Auto BE a +15 pips y se fue a trabajar. En el descanso vio la notificación: el precio había subido, el stop estaba en la entrada. Al final del turno, la operación había cerrado en el objetivo. Lo que le sacó una sonrisa no fue el resultado. Fue no haber abierto la app ni una vez durante el turno.
:::

## Navegar: lista, gráficos y scanners en el gráfico

- **Lista de símbolos:** con la variación de las últimas 24 horas y un minigráfico. Arrastra para cambiar el orden, toca la estrella para los favoritos.
- **Estado del mercado:** junto al nombre del símbolo ves si el mercado está **abierto o cerrado** y cuánto falta para que cierre, y el porcentaje de traders en compra. Es el horario del capítulo 7 sin que tengas que hacer cuentas de husos horarios.
- **Multigráfico (PRO):** 1, 2 o 4 gráficos, cada uno con su símbolo y su temporalidad. El H4 en uno, el H1 en otro, como en el capítulo 4.
- **Estudios MTM en el gráfico:** los scanners de la casa se dibujan directamente en el gráfico del WebTrader. Cuando un scanner o una idea MTM da una señal, se abre una hoja con todos los números (entrada, stop, objetivo, lote, riesgo en dinero y en porcentaje). De ahí solo tienes tres puertas: confirmar, ajustar o descartar. Una señal nunca entra sola.

[[foto: wt-mercado.jpg | El estado del mercado junto al símbolo: abierto, cerrado y cuánto falta para cerrar. | larga]]

## Trabajar con las estrategias de la casa y sus señales

El WebTrader no es solo un sitio para pulsar comprar y vender. Las estrategias de la casa viven dentro de él: en la barra sobre el gráfico tienes GoldKiller, MTM Scanner, Sensei, TrendShot y las demás. Activa **una cada vez**. Dos estrategias en el mismo gráfico son dos opiniones gritando a la vez, y el método frío necesita una sola voz.

- **GoldKiller:** cuando hay señal, aparece una barra sobre el gráfico con la dirección, la entrada, el stop y el objetivo, y un botón **«Usar este sinal»** (usar esta señal). Ese botón solo rellena el ticket. Quien confirma eres tú.
- **MTM Scanner:** dibuja la estructura del mercado (BOS, CHoCH) y, cuando da señal, marca en el gráfico la entrada, el stop y dos objetivos con el riesgo-beneficio escrito (1:2 y 1:4).
- **Sensei:** el más didáctico. Muestra una tabla de confirmaciones (tendencia, momento, estructura, volatilidad) con una nota de 0 a 20, y una checklist de lo que aún falta. Mientras diga «esperando señal», no hay operación.
- **TrendShot:** medias de tendencia y los niveles de entrada y objetivos en la escala de precio.

[[foto: wt-estrategia-scanner.jpg | El MTM Scanner activado solo: entrada, stop y dos objetivos con el riesgo-beneficio, ya dibujados. | larga]]

El camino es siempre el mismo:

1. Elige el activo y el marco temporal de tu plan.
2. Activa la estrategia que estudiaste, y solo esa.
3. Espera a que dé señal. Sin señal, no hay trade.
4. Usa la señal (o copia los números al ticket) y pon el volumen en **Riesgo %**.
5. Confirma, activa el Auto BE y el Auto Trailing, y escribe en el diario qué estrategia usaste.

Al cabo de un mes, el diario te dice qué estrategia funciona contigo. Por eso el setup tiene su propia etiqueta («Sinal GoldKiller», «Sinal Sensei», «Sinal MTM Scanner»).

[[foto: wt-estrategia-sensei.jpg | El Sensei: diez confirmaciones de veinte y la checklist de lo que falta. Todavía no es señal. | larga]]

## Historial, estadísticas y diario

En el panel de abajo están las tres piezas del capítulo 9, ya conectadas entre sí:

- **Historial:** cada operación cerrada, con entrada, salida, resultado y las salidas parciales.
- **Estadísticas:** la curva de saldo y de capital, el drawdown, la tasa de acierto, la ganancia media frente a la pérdida media y las agrupaciones por símbolo, estrategia, hora y día de la semana. Siempre en dólares de la cuenta, nunca en promesas.
- **Diario:** una nota por operación, con la emoción, el setup, las etiquetas y la captura. Escribes el porqué junto al propio historial, y no en una libreta que se queda en casa.

[[foto: wt-historico.jpg | Historial y estadísticas lado a lado: la revisión del domingo del capítulo 9 en dos toques. | larga]]

## Calendario y alertas

El **calendario económico** está dentro del WebTrader, con los eventos de impacto medio y alto de las monedas que operas. La regla de los 30 minutos del capítulo 7 se cumple sin cambiar de app. Las **alertas de precio** aparecen como líneas amarillas en el gráfico y, cuando el precio llega allí, recibes una notificación en el móvil.

## Compartir la auditoría

En la pestaña **Cuenta** puedes generar un **enlace público de auditoría**. La página muestra tus operaciones, los resultados en R y en pips, el drawdown y el riesgo, **sin nombre, sin email y sin contraseñas**. El login solo aparece si tú quieres. Lo revocas cuando quieras, y el enlace antiguo deja de abrirse.

Sirve para enseñar tu trabajo a un mentor, a un compañero o a ti mismo dentro de seis meses. Es lo contrario de una captura de beneficios: lo muestra todo, los días buenos y los malos.

[[foto: wt-auditoria.jpg | El enlace de auditoría: todo a la vista, nada de datos personales. | larga]]

## TradeLocker y WebTrader, lado a lado

Si tu bróker usa **TradeLocker**, no tienes que elegir. Conectas la cuenta TradeLocker al WebTrader y aparece en el selector, con el distintivo de la plataforma. Puedes seguir usando la app de TradeLocker para lo que te gusta de ella, y usar el WebTrader para lo que no hace de la misma manera: la gestión automática en el servidor (Auto BE, Auto Trailing, salidas parciales), los scanners MTM en el gráfico, el diario junto al historial y la auditoría compartible. Con las cuentas de MetaTrader pasa lo mismo.

[[grafico:webtrader-contas]]

## Las herramientas de la casa

Los scanners de MoreThanMoney marcan automáticamente zonas, tendencia y posibles entradas, en TradingView y en el gráfico del WebTrader. No deciden por ti. Te ahorran tiempo y te ayudan a no ver lo que no está. Estas son las cuatro que más uso con quien empieza, empezando por la que más recomiendo.

:::scanner DEFY
foto: sc-defy.jpg
estilo: Agotamiento y niveles clave
ativos: Forex, oro, índices
tempo: 15 minutos a 1 hora
Es la herramienta en la que más confío para enseñar. Dibuja bandas de agotamiento y niveles clave, y solo da señal con confirmaciones (las estrellas). Cada señal llega con todo marcado en la vela: entrada, una línea de aviso, el stop y tres objetivos fijos. No hay nada que inventar. O el plan está en el gráfico, o no hay operación.
:::

:::scanner Golden Zone
foto: sc-golden-zone.jpg
estilo: Scalping a favor de la tendencia
ativos: Oro (XAUUSD)
tempo: 5 minutos
No te manda correr detrás del precio. Marca una zona y espera a que el precio vuelva allí. Un visto es un aviso, no una entrada. Una bandera blanca significa que se acabó.
:::

:::scanner Momentum
foto: sc-momentum.jpg
estilo: Seguimiento de dirección
ativos: Forex, oro, índices, cripto
tempo: 15 minutos a 1 hora
Funciona por colores: verde compra, rojo vende, con cinco confirmaciones que valen un punto cada una. Las cajas lilas marcan mercado lateral, y el mercado lateral es el sitio donde no se entra.
:::

:::scanner Aurum Flow
foto: sc-aurum-flow.jpg
estilo: Ruptura del rango de apertura
ativos: Oro y cripto
tempo: Apertura de las sesiones
Marca el rango de la apertura y espera a que el precio lo rompa. El stop queda en el lado opuesto, así que sabes el riesgo antes de entrar. Es la herramienta más sencilla de explicar y de las más difíciles de cumplir: exige esperar a la hora correcta.
:::

### Dónde aprender a usarlas

Cada herramienta tiene una lista de reproducción gratis en YouTube con qué es, las confirmaciones y un ejemplo práctico, y un **bootcamp** en vídeo, narrado por mí, con el comportamiento de la estrategia animado de principio a fin.

| Herramienta | Lista de reproducción y bootcamp | Página de la herramienta |
|---|---|---|
| **DEFY** | youtube.com/playlist?list=PLGgrpPKdUTXs | morethanmoney.pt/scanner/defy |
| **Golden Zone** | youtube.com/playlist?list=PLV0hwsHYlTJI | morethanmoney.pt/scanner/golden-zone |
| **Momentum** | youtube.com/playlist?list=PLN4Z40YVHXW0 | morethanmoney.pt/scanner/momentum |
| **Aurum Flow** | youtube.com/playlist?list=PLdRz7aeu-CNM | morethanmoney.pt/scanner/aurum-flow |

### Cómo se accede

Los vídeos son gratis. Las herramientas, no. Hay dos maneras de usarlas:

1. **Comprar el scanner que quieras**, por semestre o para siempre, en la página de cada uno, o el **Pack de Scanners**, con todos, por mes.
2. **Ser miembro de MoreThanMoney**. Los planes de miembro te dan las clases, la comunidad, el WebTrader y las estrategias e ideas de la casa, y hay planes que ya incluyen los scanners.

Los precios y lo que entra en cada plan están siempre actualizados en morethanmoney.pt/upgrade. No los escribo aquí para que no queden desactualizados en el papel.

:::alerta Error clásico · Comprar una herramienta para no tener que tener un plan
Un scanner no sustituye al plan de una página del capítulo 8. Si no sabes tu riesgo por operación, tu ventana y tus reglas de parada, el mejor scanner del mundo solo te da señales más bonitas para cometer los mismos errores. Primero el método. Después la herramienta.
:::

## La regla fría de este capítulo

:::cartao Regla fría n.º 11
La herramienta trabaja para mi plan, nunca al revés. Volumen en riesgo, stop antes de confirmar, gestión automática activada, diario junto al historial. Una señal solo rellena: quien decide soy yo.
:::

## En resumen

- El WebTrader de MTM junta demo, cuentas MTM Funded y cuentas del bróker (TradeLocker y MetaTrader) en la misma pantalla.
- SIMPLE para el móvil, PRO para el ordenador.
- El volumen en modo Riesgo calcula el lote a partir del stop. Escribir o arrastrar da el mismo resultado.
- Auto BE, Auto Trailing y salidas parciales se ejecutan en el servidor, incluso con la pestaña cerrada.
- Historial, estadísticas y diario viven juntos. La auditoría comparte todo sin datos personales.
- DEFY, Golden Zone, Momentum y Aurum Flow: vídeos gratis para aprender, acceso por compra del scanner o como miembro.

:::exercicio Para hacer hoy
1. Entra en morethanmoney.pt/webtrader y abre una cuenta de demostración con tu saldo realista.
2. Abre una orden pendiente con el volumen en modo Riesgo al 1 %. Lote calculado: ______
3. Activa el Auto BE en esa posición. ¿A cuántos pips? ______
4. Escribe la nota del diario de esa operación dentro del WebTrader.
5. Mira una lista de reproducción de una de las herramientas de la casa y escribe, en una frase, cuándo te dice «no entres»: ____________
:::
