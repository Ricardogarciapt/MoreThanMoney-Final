# Módulo 13 — Riesgo y tamaño de posición (≈15 min)
**Objetivo:** conseguir que ninguna operación pueda estropear la cuenta, ajustando el tamaño a partir de la distancia del stop y nunca del deseo de ganar.  **No fim, o aluno consegue:** 1) definir el riesgo máximo por operación en 1 % del saldo; 2) calcular el tamaño de una posición a partir de la distancia del stop; 3) leer el apalancamiento útil y el panel de cuenta del Aurum Flow; 4) definir un límite diario y reglas de parada para las series de pérdidas.

**Nota de producción:** usar un saldo de 1.000 € de cuenta simulada en todo el módulo, siempre con «ejemplo ilustrativo» en pantalla y en voz. El panel del Aurum Flow se graba con datos del día, con valores desenfocados.

## Aula 13.1 — Riesgo de 1 % por operación (≈3 min)
**Gancho (0:00–0:20):** "Puedes tener la mejor estrategia del mundo y acabar sin cuenta. Basta una sucesión de operaciones grandes y malas. La defensa no es acertar más. Es perder poco cada vez."

**[CENA 1]** Ruben en plano medio, fondo casi negro. Texto en pantalla: «Contenido educativo. El riesgo de pérdida es real.»
**NARRAÇÃO:** Este es el módulo más aburrido del nivel tres y, para mucha gente, el más importante. Antes de hablar de números, el aviso habitual. Contenido educativo. El riesgo de pérdida es real y puede ser total. Esta lección no te promete que vas a ganar. Te promete algo más modesto y más útil: que una operación mala no te quite lo que te costó años reunir. Esa es la única promesa que un curso sobre riesgo puede hacer con honestidad. Y ni siquiera esa depende de otra cosa que de ti, de cumplir la regla todos los días, sin excepciones que parezcan razonables en el momento.

**[CENA 2]** Animación: una barra de saldo dividida en cien partes iguales, con una parte dorada encendida. Texto: «1 % del saldo por operación».
**NARRAÇÃO:** La regla que vamos a usar es esta: arriesgas como máximo un uno por ciento del saldo en cada operación. Un uno por ciento, y no lo que crees que merece la señal. Si tienes mil euros de cuenta simulada, el riesgo máximo de una operación es de diez euros. Y ojo: riesgo no es el importe invertido. Es lo que pierdes si se alcanza el stop. Son cosas distintas, y la confusión entre ambas es el origen de muchas cuentas que desaparecen. Fíjate en que la parte dorada es pequeña a propósito. Una parte pequeña no te deja caer. Ejemplo ilustrativo, con cuenta simulada, como siempre.

**[CENA 3]** Dos bloques lado a lado. A la izquierda: «invertido 500 € · stop −2 % · riesgo 10 €». A la derecha: «invertido 200 € · stop −15 % · riesgo 30 €». Rótulo: ejemplo ilustrativo.
**NARRAÇÃO:** Mira estos dos casos, ejemplos ilustrativos. En el primero, inviertes quinientos euros, pero el stop está a un dos por ciento. Si se alcanza, pierdes diez euros. En el segundo, inviertes solo doscientos, pero el stop está a un quince por ciento, y pierdes treinta. Quien mira solo el importe invertido cree que el primero es el gran riesgo. Se equivoca. El número que controla la cuenta es la pérdida en el stop. Por eso la pregunta correcta no es «¿cuánto invierto?», sino «¿cuánto pierdo si se alcanza el stop?». Esa pregunta protege el saldo, y es la que vamos a entrenar durante todo el módulo.

**[CENA 4]** Ruben con el cuaderno abierto. En la página, la fórmula: «riesgo máximo = saldo × 1 %». Debajo: «1.000 € × 1 % = 10 €».
**NARRAÇÃO:** Escribe la fórmula en lo alto del cuaderno: saldo por uno por ciento. Con mil euros simulados, el techo de pérdida de cada operación son diez euros. Ese techo no cambia porque la señal te parezca buena. Una señal entusiasmante no te autoriza a arriesgar más. Una señal floja puede llevarte a arriesgar menos, y eso también está bien. Lo que cambia de operación a operación es el tamaño de la posición, y eso es la próxima lección. El riesgo se queda fijo. Si alguna vez escribes otro número en el cuaderno, para y vuelve a esta página. El error está en la cuenta, nunca en el mercado.

**[CENA 5]** Ruben en plano cercano, hablando a cámara. Texto: «diez pérdidas seguidas de 1 % ≈ 10 % de la cuenta».
**NARRAÇÃO:** Seamos realistas. Vas a perder operaciones. Eso forma parte del método y no es señal de que el método esté averiado. Con un uno por ciento, una pérdida es un rasguño. Diez pérdidas seguidas de un uno por ciento cada una te quitan cerca de un diez por ciento de la cuenta. Es un mal periodo, que se recupera con paciencia y con reglas. Lo que destruye cuentas es lo contrario: arriesgar un diez o un veinte por ciento en una sola operación porque esta vez es diferente. Si alguna vez oyes esa frase en tu cabeza, acuérdate de la fórmula. Ella no discute. Calcula. Y por eso funciona.

**[CENA 6]** Ruben en plano medio, fondo carbón. Lista en pantalla: «1 % del saldo · el riesgo es la pérdida en el stop · 1.000 € → 10 €».
**NARRAÇÃO:** Resumen. El riesgo de cada operación es un uno por ciento del saldo. No es lo que inviertes, es lo que pierdes si se alcanza el stop. Esta regla te protege de las secuencias, porque ninguna pérdida aislada puede quitarte el juego. También te obliga a algo que el DCA ya te enseñó: decidir el tamaño antes de sentir la presión del mercado. En la próxima lección cogemos esta regla y calculamos el tamaño exacto de la posición, a partir de la distancia del stop que aprendiste en el módulo doce. No es magia. Es una división.

**Texto no ecrã:** 1 % del saldo · riesgo = pérdida en el stop · 1.000 € → 10 €
**Pregunta de verificación:** Tienes 1.000 € en cuenta simulada. ¿Cuál es el riesgo máximo en una operación? Respuesta: 10 €, un uno por ciento. Ejemplo ilustrativo.
**Fecho / CTA da aula:** "Próxima lección: calcular el tamaño a partir de la distancia del stop."

## Aula 13.2 — Calcular el tamaño a partir de la distancia del stop (≈3–4 min)
**Gancho (0:00–0:20):** "Ya sabes cuánto puedes perder: diez euros. Falta la pregunta que casi nadie hace: ¿cuánto puedo comprar para que, si se alcanza el stop, pierda exactamente esos diez?"

**[CENA 1]** Pantalla con el ejemplo del módulo 12: entrada en 100, stop a 98. Rótulo: ejemplo ilustrativo.
**NARRAÇÃO:** Vamos a usar el ejemplo del módulo doce, con la entrada en cien y el stop dos por ciento por debajo, en noventa y ocho. Ejemplo ilustrativo, como siempre. La cuenta simulada tiene mil euros y el riesgo máximo es de diez. La pregunta es: ¿cuánto tengo que haber invertido en esta posición para que el stop, si se alcanza, cueste exactamente diez euros? No es un número que se adivina. Tiene una fórmula, y la fórmula cabe en una tarjeta. Te la voy a mostrar despacio, con la calculadora en la mano, para que puedas repetir la cuenta tú solo sin mirarme.

**[CENA 2]** Diagrama con la fórmula destacada: «Tamaño = riesgo en € ÷ distancia del stop en %».
**NARRAÇÃO:** La fórmula es esta: el tamaño de la posición es igual al riesgo en euros dividido entre la distancia del stop en porcentaje. El riesgo son diez euros. La distancia del stop son dos por ciento. Diez entre dos por ciento, o entre cero coma cero dos en la cuenta, da quinientos. Quinientos euros de posición. Si el precio cae un dos por ciento, pierdes un dos por ciento de quinientos, que son diez euros. Exactamente tu riesgo, ni un céntimo más. Cada pieza tiene su papel: el riesgo define el techo, el stop define la distancia, y el tamaño es lo que encaja entre ambos.

**[CENA 3]** Tabla en pantalla: «stop 2 % → posición 500 € · stop 4 % → 250 € · stop 5 % → 200 €». Texto: «mismo riesgo, tamaños distintos».
**NARRAÇÃO:** Fíjate en lo que pasa cuando cambias solo la distancia del stop, manteniendo el riesgo en diez euros. Con el stop a dos por ciento, la posición es de quinientos euros. Con el stop a cuatro por ciento, baja a doscientos cincuenta. Con el stop a cinco por ciento, queda en doscientos. El riesgo es siempre diez. Un stop más ancho obliga a una posición más pequeña. Un stop más corto te deja comprar más. Ejemplo ilustrativo, pero la lección es firme: nunca elijas el tamaño antes de saber dónde está el stop. Es el stop el que manda sobre la posición, y no al revés.

**[CENA 4]** Ruben en el cuaderno, con cuatro pasos numerados: «1 saldo · 2 riesgo de 1 % · 3 distancia del stop en % · 4 tamaño = 2 ÷ 3».
**NARRAÇÃO:** Escribe el procedimiento en cuatro pasos, siempre en el mismo orden. Uno: el saldo de la cuenta. Dos: el riesgo, un uno por ciento de ese saldo. Tres: la distancia del stop en porcentaje, sacada del plan de la señal. Cuatro: divides el dos entre el tres. Ese resultado es el tamaño. Si no tienes la distancia del stop, no tienes señal, y no hay tamaño que se pueda calcular. No adivines la distancia ni la redondees a lo que te convenga. Viene del plan escrito antes de entrar, y ahí es donde debe quedarse.

**[CENA 5]** Ruben con un segundo ejemplo en el cuaderno: «10 € ÷ 3 % = 333 € → queda en 330 €». Rótulo: ejemplo ilustrativo.
**NARRAÇÃO:** Segundo ejemplo, también ilustrativo. El stop está ahora a un tres por ciento. Diez entre cero coma cero tres da trescientos treinta y tres. No redondeas hacia arriba. Redondear hacia arriba es aumentar el riesgo sin querer, y una cuenta que crece sin que te des cuenta es justo lo que queremos evitar. Redondeas hacia abajo, a trescientos treinta, sin dudar. Fíjate en que el stop más ancho dio una posición más pequeña, como vimos hace un momento. La regla siempre cuadra, y eso es lo que la hace fiable. Cuando no cuadra, el error está en la cuenta.

**[CENA 6]** Ruben en plano medio. Frase en pantalla: «Stop primero, tamaño después.»
**NARRAÇÃO:** Resumen. Primero el stop, después el tamaño. La fórmula es el riesgo en euros dividido entre la distancia del stop en porcentaje, y siempre redondeas hacia abajo. No hay opinión en esta cuenta. Hay una distancia, un riesgo y un resultado. Si algún día sientes que el tamaño «debería» ser mayor porque la señal es buena, acuérdate de esta lección: la convicción no entra en la fórmula. En la próxima lección miramos el apalancamiento, que mucha gente confunde con el tamaño, y el panel de cuenta del Aurum Flow, que muestra varias de estas cuentas ya hechas.

**Texto no ecrã:** tamaño = riesgo € ÷ distancia del stop % · redondea hacia abajo · stop primero
**Pregunta de verificación:** Riesgo de 10 €, stop a un 5 %. ¿Cuál es el tamaño? Respuesta: 200 €. Ejemplo ilustrativo.
**Fecho / CTA da aula:** "Próxima lección: apalancamiento útil y el panel de cuenta."

## Aula 13.3 — Apalancamiento útil y el panel de cuenta (≈3 min)
**Gancho (0:00–0:20):** "El apalancamiento es el botón que más gente confunde con el tamaño de la posición. Y confundir los dos es el camino más corto para perder más de lo que querías."

**[CENA 1]** Pantalla con un control de apalancamiento moviéndose. Texto: «apalancamiento ≠ tamaño ≠ riesgo».
**NARRAÇÃO:** Vamos a separar tres cosas que parecen una sola. El apalancamiento es el multiplicador que la plataforma te da para abrir una posición mayor que el dinero que tienes depositado. El tamaño, o nocional, es el valor total de la posición. Y el riesgo es lo que pierdes si se alcanza el stop. El apalancamiento no crea riesgo de la nada. Cambia cuánto dinero tienes que reservar como margen, y hace fácil abrir posiciones grandes sin darte cuenta. Si el tamaño y el stop no han cambiado, el riesgo tampoco ha cambiado, sea cual sea el apalancamiento que elegiste.

**[CENA 2]** Panel de cuenta del Aurum Flow, con los valores de hoy desenfocados. Texto: «apalancamiento útil · nocional · comisiones · riesgo % por operación».
**NARRAÇÃO:** El panel de cuenta del Aurum Flow muestra cuatro cosas para el tamaño que elegiste. El apalancamiento útil: el apalancamiento que necesita la posición, para el tamaño elegido, y no el máximo que ofrece la plataforma. El nocional, que es el valor total de la posición. El coste de comisiones, a la entrada y a la salida, que se come parte del resultado. Y el riesgo en porcentaje por operación. Los valores en pantalla están desenfocados, porque no importan para la lección. Lo que importa es que aprendas a leer los cuatro, y no a memorizar números.

**[CENA 3]** Ruben con el ejemplo en pantalla: «cuenta 1.000 € · posición 500 € · apalancamiento útil ≈ 1×». Rótulo: ejemplo ilustrativo.
**NARRAÇÃO:** Aplica esto al ejemplo de hace un momento: cuenta de mil euros, posición de quinientos. El apalancamiento útil es bajo, alrededor de una vez. Significa que la posición cabe en la cuenta sin estirar nada. Ahora imagina que el panel te mostrara diez veces para la misma posición. ¿Qué cambiaba? El tamaño seguía siendo quinientos y el stop seguía a dos por ciento. Lo único que cambiaba era el margen que la plataforma pide para sostener la posición. Quien elige el apalancamiento no elige el riesgo. El riesgo ya estaba escrito en el stop y en la fórmula.

**[CENA 4]** Ruben en el cuaderno, con la regla escrita destacada: «usa el apalancamiento que pide el tamaño, nunca el máximo».
**NARRAÇÃO:** La regla que escribes en el cuaderno es esta, sin excepciones: el apalancamiento que uso es el que exige el tamaño calculado, nunca el máximo ofrecido, aunque la plataforma lo presente como la opción normal. Si la cuenta cabe sin apalancar, no apalanco. Si la posición exige algo de apalancamiento, el panel te lo muestra. Y confirmas siempre el nocional antes de pulsar confirmar. No es una regla de miedo, es una regla de precisión. La plataforma muestra el máximo porque es lo que muestra. Tu interés es otro: es el tamaño que calculaste en la lección anterior, y nada más.

**[CENA 5]** Ruben con la cuenta de las comisiones en pantalla: «ejemplo ilustrativo: comisión de 0,1 % por lado · posición 500 € → 0,50 € a la entrada + 0,50 € a la salida».
**NARRAÇÃO:** Por último, las comisiones. En un ejemplo ilustrativo, con una comisión de cero coma uno por ciento por lado, una posición de quinientos paga cincuenta céntimos a la entrada y cincuenta céntimos a la salida. Parece poco. Pero, con un stop de dos por ciento y un riesgo de diez euros, un euro de comisiones es un diez por ciento del riesgo que definiste. No es un detalle. Por eso el panel muestra el coste, y por eso miras antes de confirmar, y no después. La comisión real es la de tu plataforma, y está en sus condiciones. Confírmala. No uses la mía como si fuera la tuya.

**[CENA 6]** Ruben en plano medio. Texto en pantalla: «apalancamiento ≠ tamaño ≠ riesgo · 4 números en el panel · las comisiones cuentan».
**NARRAÇÃO:** Resumen. El apalancamiento es la forma en que la plataforma pide margen. El tamaño es el valor de la posición. El riesgo es la pérdida en el stop. No confundas los tres. El panel del Aurum Flow muestra el apalancamiento útil, el nocional, las comisiones y el riesgo por operación, y tu regla es mirar los cuatro antes de pulsar cualquier botón. En la última lección del módulo hablamos de lo que pasa después de una pérdida, de un mal día, y de cómo parar a tiempo, antes de que un mal día se convierta en una mala semana.

**Texto no ecrã:** apalancamiento ≠ tamaño ≠ riesgo · 4 números en el panel · las comisiones cuentan
**Pregunta de verificación:** Posición de 500 € en una cuenta de 1.000 €. ¿El apalancamiento útil es alto o bajo? Respuesta: bajo, alrededor de una vez. La posición cabe en la cuenta sin estirar. Ejemplo ilustrativo.
**Fecho / CTA da aula:** "Última lección: límite diario y reglas de parada."

## Aula 13.4 — Límite diario, series de pérdidas y reglas de parada (≈3 min)
**Gancho (0:00–0:20):** "La peor decisión de una cuenta rara vez es la primera pérdida. Es la cuarta, después de una mañana mala, cuando decides que «ahora sí»."

**[CENA 1]** Ruben en plano medio. Texto en pantalla: «el mal día también se planifica».
**NARRAÇÃO:** Última lección del módulo, y quizá la que más te ahorra. Todo lo que hemos visto hasta ahora trata de operaciones aisladas. Pero quien pierde dinero, casi siempre, pierde en secuencia. Una pérdida, luego otra, luego una tercera, y la cabeza empieza a pedir una recuperación inmediata. Ese impulso tiene nombre: perseguir pérdidas. Y el antídoto no es la fuerza de voluntad, que se gasta rápido. Es una regla escrita antes de empezar el día. Quien decide qué hacer después de tres pérdidas a las diez de la mañana ya está decidiendo con la cabeza en modo venganza. Por eso la decisión tiene que estar tomada antes.

**[CENA 2]** Gráfico de barras con tres barras rojas, cada una marcada «−1 %». Rótulo: ejemplo ilustrativo.
**NARRAÇÃO:** Mira esta serie, ejemplo ilustrativo. Tres pérdidas de un uno por ciento cada una. En la cuenta de mil euros, son unos treinta euros. Duele, pero no es el fin. El problema empieza cuando la cuarta operación sale más grande, porque la persona quiere recuperar deprisa. En ese momento, el riesgo deja de estar en el uno por ciento de la regla y pasa a ser una apuesta desesperada. Nadie decide eso a propósito. Ocurre poco a poco, con la justificación de que «esta vez compensa». La regla de parada existe para impedir ese paso, y para que no tengas que discutirla contigo mismo en el peor momento.

**[CENA 3]** Ruben con el cuaderno, escribiendo tres reglas de parada. Texto: «límite diario · serie de pérdidas · parada es parada».
**NARRAÇÃO:** Escribe tres reglas de parada, con tus números. La primera es el límite diario de pérdida. Por ejemplo, y es solo un ejemplo ilustrativo, un dos por ciento del saldo en un día: lo alcanzas, cierras la plataforma. La segunda es la serie de pérdidas: tres pérdidas seguidas en el mismo día, y paras. La tercera es la más importante: después de una parada, no vuelves a la pantalla ese día, ni siquiera para «ver si la señal mejoró». Esta es la regla que más cuentas salva, porque el mercado no te debe nada y siempre vuelve mañana. Los números que escribes son los tuyos. Los que uso aquí son pequeños a propósito.

**[CENA 4]** Lista de comprobación de dos minutos en pantalla: «¿límite escrito? · ¿serie escrita? · ¿máximo de operaciones? · ¿noticias de la franja vistas?».
**NARRAÇÃO:** Antes de cada sesión, haz una rutina de dos minutos. ¿El límite diario está escrito? ¿La serie de pérdidas está escrita? ¿Sabes cuántas operaciones vas a tomar, como máximo? ¿Has visto las noticias de la franja? Si la respuesta a alguna es no, no empiezas. Fíjate en que esta rutina no dice nada sobre el mercado. Dice todo sobre ti. Es la parte del trading que más se parece al ritual del viernes del DCA: reglas antes del dinero, y no durante. Quien tiene hecha esta rutina no necesita ser más listo que el mercado. Necesita ser más previsible que su propia emoción.

**[CENA 5]** Pantalla con el texto: «Misión del módulo 13: calculadora de tamaño para 5 señales, en cuenta simulada de 1.000 €».
**NARRAÇÃO:** Misión del módulo. Elige cinco señales pasadas del Aurum Flow y haz las cuentas en una cuenta simulada de mil euros. Para cada señal, rellena la calculadora de tamaño: el riesgo en euros, la distancia del stop en porcentaje, el tamaño calculado redondeado hacia abajo, el apalancamiento útil que muestra el panel y el coste de comisiones. No abras ninguna posición real para esto. Necesitas hacer la cuenta cinco veces, sin saltarte ninguna. Si alguna te deja dudas, vuelve a la fórmula y no al instinto. La calculadora no tiene opinión. Tu intuición sí, y por eso la calculadora va primero.

**[CENA 6]** Ruben en plano cercano, con el aviso en pantalla: «Contenido educativo, no es asesoramiento financiero. El riesgo de pérdida es real, y puede ser total.»
**NARRAÇÃO:** Cierre del módulo trece, y del bloque de riesgo. Un uno por ciento por operación. Tamaño a partir del stop. Apalancamiento que pide el tamaño, y nunca el máximo. Límite diario y serie de pérdidas escritos antes de la primera señal. Ninguna de estas reglas te garantiza beneficios. Lo que hacen es limitar lo que una mala secuencia te puede quitar, y eso ya es mucho. Contenido educativo, no es asesoramiento financiero. El riesgo de pérdida es real, y puede ser total. En el módulo catorce vemos cómo ejecutar sin emoción, con el WebTrader, las cuentas simuladas y el MTM Auto.

**Texto no ecrã:** calculadora de tamaño · misión: 5 señales · parada es parada
**Pregunta de verificación:** Después de tres pérdidas seguidas en el mismo día, ¿cuál es la regla? Respuesta: paras y no vuelves a la pantalla ese día. La regla se escribió antes.
**Fecho / CTA da aula:** "Fin del Módulo 13. Próximo: Módulo 14, Ejecutar sin emoción. Botón en pantalla: «Continuar al Módulo 14»."
