# Pips, lotes y el precio de un error

> Nadie pierde la cuenta por no saber lo que es un pip. La pierde por saberlo y no hacer la cuenta.

Piensa en la carnicería. Pides «un poco de carne» y el carnicero pesa. El precio por kilo es el mismo para todos, pero la cuenta final depende de cuánto te llevas. En el Forex es igual: el precio del par es el mismo para todos, y tu cuenta depende del tamaño de la posición. Quien no sabe pesar, paga lo que no quería.

Este es el capítulo más aburrido del libro. También es el que más te protege.

## El pip

El **pip** es la unidad de medida del movimiento. En la mayoría de los pares es la cuarta cifra decimal:

- EUR/USD pasa de 1,0850 a 1,0851: ha subido **1 pip**.
- En los pares con el yen, es la segunda cifra decimal: USD/JPY de 151,40 a 151,41 es 1 pip.
- MetaTrader 5 muestra una cifra más (1,08502). Ese último dígito es una décima de pip, llamada «pipette».

Fíjate en un detalle de la pantalla: en las Cotizaciones, MT5 muestra el spread en **puntos**, no en pips. En los pares con cinco cifras decimales, 10 puntos son 1 pip. Si ves «8» junto a la hora, el spread es de 0,8 pips.

En el oro, la convención varía de un bróker a otro. Antes de operar XAU/USD, confirma en la especificación del contrato cuánto vale cada movimiento.

## El lote

El **lote** es el tamaño de la posición.

| Nombre | Lotes en MT5 | Unidades de la moneda base |
|---|---|---|
| Estándar | 1,00 | 100.000 |
| Mini | 0,10 | 10.000 |
| Micro | 0,01 | 1.000 |

Y aquí está la conexión que importa: el valor de cada pip depende del lote.

[[grafico:valor-pip]]

En una cuenta en dólares, en EUR/USD, 1 pip vale unos 10 $ con 1 lote, 1 $ con 0,10 y 0,10 $ con 0,01. Si el precio anda 30 pips en tu contra, la diferencia entre un microlote y un lote estándar es la diferencia entre perder 3 $ y perder 300 $. El gráfico es el mismo. Tu vida, no.

## En la pantalla: el campo «Volumen»

En MT5, el lote se llama **Volumen** y aparece en la ventana de orden, justo debajo del tipo de orden. Todavía no vas a abrir ninguna (eso queda para el capítulo 6), pero conviene ver ya dónde está el número que más dinero mueve en tu cuenta.

:::galeria El selector de lotes
mt5-tel-ordem-lotes.png | Al tocar el volumen se abre un selector con botones de −0,10 a +0,10 y el número grande en el centro. Ese número decide cuánto vale cada pip.
:::

:::alerta Error clásico · Elegir el lote «a ojo»
Quien empieza abre MetaTrader 5, ve el campo «Volumen» y escribe un número que «parece poco». 0,50, porque es menos de uno. Pero 0,50 lotes en EUR/USD son unos 5 $ por pip, y un movimiento normal de 40 pips en tu contra son 200 $. El volumen no se elige a ojo. Se calcula, y en el capítulo 5 aprenderás a hacerlo.
:::

:::historia A Marta, dia 4
Curiosa, Marta abrió la ventana de orden y tocó el volumen. El selector marcaba 0,01 y ella pulsó tres veces el +0,10: 0,31. «Todavía es menos de la mitad de un lote.» Antes de cerrar, hizo la cuenta de este capítulo en un papel: 0,31 lotes en EUR/USD son unos 3,10 $ por pip. Con un stop de 25 pips, perdería unos 78 $ en una sola operación, cerca del 15 % de la demo. Cerró la ventana sin colocar nada y escribió en la libreta: «El volumen no es una opinión».
:::

## El spread y el swap: los costes que no aparecen en la factura

Cada operación empieza perdiendo. Cuando compras, lo haces al precio más alto (ask). Cuando cierras, vendes al más bajo (bid). Esa diferencia, el spread, es el coste de entrada.

Con un spread de 1 pip y 0,10 lotes en EUR/USD, cada operación cuesta unos 1 $. Parece nada. Ahora multiplica.

[[grafico:custo-spread]]

Quien hace 200 operaciones al mes paga 200 $ solo por entrar, antes de saber si ganó o perdió. Por eso el método frío es lento a propósito: menos operaciones, mejor elegidas.

El **swap** es el interés que pagas (o, a veces, recibes) por mantener una posición abierta de un día para otro. Los miércoles, en muchos brókeres, se cobra triple por el fin de semana. Ves el valor en la especificación del símbolo en MT5: en el móvil, en **Cotizaciones**, toca el par y elige **Especificación**; en el PC, botón derecho sobre el símbolo y **Especificación**.

:::ecra MetaTrader 5 · Especificación · EUR/USD
Tamaño del contrato: 100.000
Volumen mínimo: 0,01
Paso de volumen: 0,01
Swap de compra: −6,8 puntos
Swap de venta: +1,2 puntos
Swap triple: miércoles
:::

Valores ilustrativos. Abre la especificación de tu símbolo y escribe los tuyos.

## Apalancamiento y margen: la lupa

El **apalancamiento** te permite controlar una posición mayor que el dinero que tienes en la cuenta. Con apalancamiento de 30:1, para abrir 30.000 € de exposición necesitas 1.000 € de **margen**, que es el depósito que el bróker te bloquea.

El apalancamiento no cambia la dirección del mercado. Cambia el tamaño del impacto. Es una lupa: aumenta la ganancia y aumenta la pérdida, en la misma medida.

En la Unión Europea, para clientes minoristas, la ESMA limita el apalancamiento: hasta 30:1 en los pares principales, 20:1 en los demás pares, en el oro y en los principales índices, y todavía menos en otros activos. Los brókeres regulados en la UE también tienen que garantizar que no pierdes más que el saldo de la cuenta (protección contra saldo negativo).

:::destaque
El apalancamiento que te ofrece el bróker es el máximo permitido, no una recomendación. Tu riesgo se decide por el lote y el stop, nunca por el apalancamiento disponible.
:::

Cuando la pérdida abierta se come el margen hasta cierto nivel, el bróker avisa (margin call) y luego empieza a cerrar posiciones solo (stop out). No es un castigo. Es la lupa haciendo su trabajo.

[[grafico:recuperacao-perdas]]

Este gráfico explica por qué la protección vale más que el ataque. Después de perder la mitad de la cuenta, necesitas duplicar lo que queda solo para volver al inicio. Nadie se acuerda de esto en la operación en la que se pasa con el lote.

## De mi vida: el segundo salto

Elegí los paracaidistas teniendo miedo a las alturas. Mi abuela me había dicho algo que nunca olvidé: «Tú no tienes que tener miedo. Eres una persona que abraza los miedos.» Era un chaval flaco. En las pruebas físicas hice 30 flexiones cuando se pedían 35, aprobé las barras y compensé en las sentadillas. Aprobé por los pelos. Por haber faltado a una inspección, era el mayor de un curso de unos 400, y acabé como jefe de curso del 1.º pelotón, con decisiones cayéndome encima todos los días. Desde la recluta hasta el curso de paracaidismo, pasé de entrar por los pelos a ser el mejor del curso en la parte física. Por el camino perdí el miedo a las alturas.

El curso fue menguando: de 400 a cien y pocos, y unos 53 en los saltos. En el primero fui el primero en la puerta. Luz verde, salto, y una sensación de libertad que me hizo decidir allí mismo, en el aire, que la vida militar era lo que quería. En el segundo salto se invirtieron las posiciones. Fui el último, y salté ya con la luz roja, fuera de la zona limpia. El salto salió bien. Fue en el aterrizaje, en la voltereta, cuando se me reventó la rodilla derecha.

Faltaba un día. Al día siguiente, tres saltos más me darían el brevet y la boina verde. En lugar de eso, tuve que quitarme 1,8 cm de cartílago y elegir entre un inmovilizador con tornillos o una artroscopia en el Hospital da Rábida, pagada por mi seguro, porque el ejército no la pagaba. Salí de los paracaidistas para cuidar de mi salud. Fue la primera vez que me rendí en la vida, y me dijeron que no volvería a correr.

Te cuento esto en un capítulo sobre pips y lotes por una razón sencilla: un error pequeño, en el sitio equivocado, puede costar algo enorme. Una coma en el volumen, un lote calculado a las prisas, una entrada «ya que estoy aquí» con la luz roja encendida. En el mercado, como en aquel salto, el tamaño del estrago no depende del tamaño del error. Depende de dónde ocurre.

## La regla fría de este capítulo

:::cartao Regla fría n.º 3
Antes de cada operación sé tres números: cuánto vale 1 pip con mi lote, cuánto pago de spread y cuánto pierdo si se toca el stop. Si no los sé, no entro.
:::

## En resumen

- 1 pip es la cuarta cifra decimal en la mayoría de los pares; en los pares con el yen, la segunda.
- El valor del pip depende del lote: unos 10 $, 1 $ o 0,10 $ en EUR/USD, en una cuenta en dólares.
- El spread se paga en todas las operaciones; quien opera mucho, paga mucho.
- El swap se paga por cada noche con la posición abierta.
- El apalancamiento es una lupa. El riesgo se controla con lote y stop.
- En la pantalla: spread en puntos (10 puntos = 1 pip) y el lote en el campo «Volumen».

:::exercicio Para hacer hoy
1. En la demo, abre la especificación de tu par (móvil: Cotizaciones › par › Especificación; PC: botón derecho › Especificación).
2. Copia en la libreta: tamaño del contrato, volumen mínimo, swap de compra y de venda, día del swap triple.
3. Haz la cuenta: con 0,01 lotes, ¿cuánto pierdes si el precio anda 25 pips en tu contra? ____________
4. ¿Y con 0,10? ____________ ¿Y con 1,00? ____________
5. Mira las tres respuestas y escribe cuál de ellas te dejaría dormir. ____________
:::
