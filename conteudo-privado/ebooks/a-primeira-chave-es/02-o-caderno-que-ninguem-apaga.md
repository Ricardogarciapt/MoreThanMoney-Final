# El cuaderno que nadie borra

> Una blockchain es un cuaderno que todo el pueblo lee y que nadie puede romper por su cuenta.

Imagina un pueblo pequeño donde todo el mundo se conoce. Hay un cuaderno en la plaza donde se anota quién debe qué. Cuando el panadero vende pan a crédito al herrero, se escribe la línea: «el herrero debe 5 € al panadero». Durante años, el cuaderno queda en manos del tendero, que lo custodia. El problema es obvio: ¿y si el tendero es deshonesto y arranca las páginas que no le convienen?

La solución del pueblo es sencilla. En vez de un único cuaderno guardado por una persona, hay una copia en casa de cada familia. Cuando alguien escribe una línea nueva, se actualizan todas las copias. Para hacer trampa, habría que alterar la mayoría de las copias a la vez, lo cual es mucho más difícil que arrancar una sola.

Esta es la intuición detrás de la blockchain. Es un registro compartido, copiado por muchos ordenadores, donde las transacciones se organizan en bloques unidos entre sí.

[[grafico:blockchain-caderno]]

## Qué es un bloque

Cada bloque es una página del cuaderno. Tiene un conjunto de transacciones (quién envió qué a quién), una marca de tiempo y una huella digital de la página anterior, que se llama hash. Esa huella digital une un bloque con el anterior. Si alguien cambia una coma en una página antigua, la huella cambia y la unión con las páginas siguientes se rompe. La red entera detecta la incoherencia.

No necesitas saber hacer cuentas para entender la idea. Basta con imaginar páginas pegadas unas a otras con un pegamento que se estropea si alguien toca un detalle.

La huella digital, el hash, funciona como un sello de cera que sirve solo para esa carta. Si la carta se abre y se vuelve a cerrar con un texto distinto, el sello deja de coincidir. No necesitas saber cómo se calcula el hash para entender que es sensible a cualquier cambio, por pequeño que sea. Es esa sensibilidad la que hace que el cuaderno sea difícil de falsificar.

:::destaque
En la blockchain no se confía en una persona. Se confía en las reglas y en el número de copias independientes del registro.
:::

:::post @morethanmoney.pt
imagem: Un cuaderno que nadie borra.
legenda: Esto es una blockchain. Sin jerga, sin magia: un registro público que miles de ordenadores guardan a la vez. Quien te diga que es más complicado que esto quiere venderte algo.
:::

## Cómo se llega a un acuerdo: minería y proof-of-stake

Si todo el mundo pudiera escribir páginas a la vez, el cuaderno se volvería confuso. Hace falta una regla para decidir quién escribe la siguiente página y quién la valida. Hay dos formas principales de hacerlo.

**Proof-of-work (prueba de trabajo).** Es la forma que usa Bitcoin. Los participantes, llamados mineros, compiten por resolver un problema matemático difícil. Quien lo resuelve primero escribe el bloque y recibe una recompensa. La idea es que alterar el pasado sería tan caro en energía y equipos que no compensaría. El coste es real y consume mucha electricidad.

**Proof-of-stake (prueba de participación).** Es la forma que usa Ethereum desde septiembre de 2022, en un momento llamado The Merge. En vez de gastar energía en cálculos, quien quiere validar bloques bloquea una cantidad de la propia moneda como garantía. Si valida mal, puede perder esa garantía. La lógica es que quien tiene mucho que perder tiene razones para portarse bien.

Las dos formas persiguen el mismo objetivo: que nadie decida solo qué es verdad en el cuaderno.

## Por qué esto importa a quien empieza

La blockchain explica por qué las transacciones de cripto son, por regla general, irreversibles. Si envías dinero a la dirección equivocada, no hay ningún banco que anule la operación. No hay atención al cliente que haga una devolución. Esta característica es una ventaja para quien no quiere censura, pero es un peligro para quien se equivoca o es engañado.

:::alerta
Una transacción enviada en una blockchain pública no se puede revertir. Antes de confirmar, revisa la dirección, la red y el importe. Dos veces, si hace falta.
:::

:::ecra Cartera · Confirmar envío (ejemplo)
Para: 0x7a...f3 (dirección de ejemplo)
Red: elige la red antes de enviar
Valor: 50,00 €
Comisión de red (ejemplo): 0,40 €
Estado: esperando confirmación
:::

:::historia
Caso ilustrativo: Inés, la misma enfermera de Coimbra del primer capítulo, quiso enviar 50 € en cripto a una amiga. Copió la dirección, pero solo copió la mitad, porque el móvil cortó la línea. Solo se dio cuenta cuando ya lo había confirmado. No había nadie a quien pedir la devolución. No fue un drama, fue una lección: la libertad de la blockchain exige cuidado humano.
:::

:::conversa WhatsApp · Amiga (ejemplo)
Amiga: ¿Ya me mandaste los 50?
eu: Sí. Pero copié mal la dirección, qué tontería.
Amiga: ¿Y ahora?
eu: Ahora no tiene vuelta atrás. Por eso, revísalo siempre dos veces.
:::

## Ejercicio con papel y lápiz

:::exercicio Un registro de tres bloques
1. En una hoja, dibuja tres cuadrados unidos por flechas. Cada cuadrado es un bloque.
2. Dentro de cada cuadrado, escribe una transacción imaginaria entre dos personas de tu familia.
3. En uno de los cuadrados del medio, cambia un valor. Pregúntate qué cuadrados quedan «sospechosos» después.
4. Escribe, en una frase, por qué la copia compartida hace más difícil el fraude.

____________________________________________________________

____________________________________________________________
:::

:::cartao Antes de confirmar cualquier envío
- Revisa la dirección, letra a letra, y no solo el principio y el final.
- Confirma la red. Si la red es la equivocada, el dinero puede no llegar nunca.
- Revisa el importe y la comisión. No te fíes solo de lo que dice el botón.
:::

## En resumen

- Una blockchain es un registro compartido, organizado en bloques unidos entre sí.
- Alterar un bloque antiguo obliga a alterar todos los siguientes, algo difícil y visible.
- Bitcoin usa proof-of-work (minería); Ethereum pasó a proof-of-stake en septiembre de 2022.
- Las transacciones en blockchains públicas son, por regla general, irreversibles.
- La seguridad empieza por ti: confirma siempre dirección, red e importe.

## Para hacer hoy

1. Elige una transacción real que ya hayas hecho (una transferencia, un pago) y pregúntate quién la podría anular.
2. Compara la respuesta con la forma en que funciona la blockchain. La diferencia se te quedará en la memoria.
3. Guarda en el móvil una nota con las tres comprobaciones de la tarjeta de arriba, para leerlas antes de cualquier envío.
