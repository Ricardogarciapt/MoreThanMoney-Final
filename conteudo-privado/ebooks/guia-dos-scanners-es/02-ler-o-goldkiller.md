# Leer el GoldKiller

> Lee las piezas juntas. Es en la combinación donde el gráfico cobra sentido.

Vídeo de este capítulo: **Bootcamp GoldKiller, vídeo 1 · Fundamentos: qué es y cómo se lee.**

El GoldKiller sigue la tendencia del oro con un cálculo que corre por debajo del gráfico, marca cada giro con una señal y dibuja hasta dónde suele ir el precio a tu favor y en tu contra desde la entrada. Son cuatro piezas. Aprende cada una por separado.

## 1. El motor de tendencia

Por debajo del gráfico funciona un SuperTrend: una línea que mide la volatilidad media de las últimas velas (el ATR) y se aleja del precio tres veces esa distancia. En una subida, la referencia sube por escalones por debajo de las velas. En una bajada, baja por encima de ellas. Solo cambia de lado cuando el precio la atraviesa.

Esta línea no aparece dibujada. El indicador la calcula, pero lo que ves es su resultado: el giro.

## 2. El giro: BUY y SELL

Cuando el motor pasa por debajo del precio, aparece una etiqueta verde **BUY**, debajo de la vela. Cuando pasa por encima, aparece una etiqueta roja **SELL**, encima de la vela.

:::destaque
Nada está confirmado mientras la vela no cierra. Aquí es donde más gente se equivoca: ve la vela moverse, entra antes del cierre y el giro desaparece.
:::

## 3. La línea central

En la misma vela del giro, una línea gris salta al precio de cierre. Es la **línea central**: la entrada de la nueva pierna. Todo lo demás se mide a partir de ella.

## 4. Los niveles Gain y Drawdown

A partir de cada giro, el scanner dibuja escalones:

- **Verdes, los Gain:** hasta dónde fueron las piernas anteriores a favor.
- **Rojos, los Drawdown:** hasta dónde fueron en contra.

Los valores salen de las piernas anteriores del propio precio. No son una previsión. Son una referencia estadística: te dicen cuánto espacio tienes hasta el primer objetivo y cuánto suele retroceder el precio antes de seguir su camino.

[[foto: gk-render-2-en.jpg | Giro, línea central y niveles. Render MTM, simulación con precios generados. | larga]]

| Nivel | Para qué sirve en las alertas |
|---|---|
| **Gain 50** | Primer objetivo (TP1) |
| **Gain 75** | Segundo objetivo (TP2) |
| **Gain 100** | Tercer objetivo (TP3), solo las piernas más fuertes llegan ahí |
| **Drawdown 50** | Stop: el retroceso típico de las piernas anteriores |

:::alerta Error clásico · Tratar los niveles como paredes
En una tendencia fuerte, el precio supera el Gain 50, el 75, el 100 y sigue. Otras veces no llega ni al primero. Los niveles son una regla de medir, no una promesa.
:::

:::exercicio El trabajo de casa del vídeo 1
Elige el oro en 15 minutos y no cambies nada durante el ejercicio. Busca en el histórico cinco giros y anota, para cada uno:

| Giro | BUY o SELL | ¿Llegó primero al Gain 50 o al Drawdown 50? | ¿Superó el Gain 75? |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |

Todo esto sin operar. Este ejercicio entrena el ojo mejor que cualquier explicación.
:::
