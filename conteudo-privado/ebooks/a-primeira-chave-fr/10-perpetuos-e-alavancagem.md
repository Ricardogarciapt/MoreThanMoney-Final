# Perpétuels et effet de levier

> L'effet de levier ne crée pas d'argent. Il amplifie ce qui était déjà là, erreurs comprises.

C'est le chapitre que j'ai volontairement laissé vers la fin. Les perpétuels sont très différents d'un achat de monnaie que tu gardes. Quand je les explique à quelqu'un qui vient de commencer, ma principale préoccupation est que la personne comprenne les risques avant de ressentir la tentation de les utiliser. Si tu lis ceci au début du livre, ce n'est pas grave : tu peux aller directement au dernier chapitre et revenir ici plus tard.

:::post @morethanmoney.pt
imagem: L'effet de levier ne pardonne pas.
legenda: 100x semble puissant. C'est juste un prix de liquidation tout proche. Si tu ne sais pas dire où tu perds tout, l'effet de levier n'est pas pour toi. Pas encore.
:::

## Ce que sont les perpétuels

Un contrat perpétuel, ou perpétuel, est un instrument dérivé. Tu n'achètes pas la monnaie. Tu paries que le prix va monter (long) ou descendre (short), avec un contrat qui n'a pas de date d'échéance. Pour ouvrir une position, tu utilises une marge, qui est une fraction de la valeur totale, et la plateforme te prête le reste. C'est ce qui crée l'effet de levier.

Un exemple. Si tu as 100 € et que la plateforme te prête 900 € de plus, tu peux manipuler une valeur de 1 000 €. Si le marché monte de 10 %, tu gagnes 100 € sur tes 100 €, soit 100 %. S'il descend de 10 %, tu perds les 100 € en entier. Le même mouvement qui t'aurait coûté 10 € dans un achat simple te coûte tout.

:::destaque
L'effet de levier multiplie les gains et les pertes de la même façon. La différence, c'est que la perte peut être totale avant même que le marché ait semblé faire quelque chose de grave.
:::

## Liquidation : le moment où la plateforme ferme la position

Quand la perte consomme la marge que tu as déposée, la plateforme ferme la position automatiquement. C'est ce qu'on appelle la liquidation. Il n'y a pas de discussion, pas de délai d'attente, et souvent aucune possibilité de réagir.

[[grafico:alavancagem]]

En première approximation, et sans compter les frais, la liquidation intervient près de ces niveaux : avec 2×, la position est liquidée près d'une baisse de 50 % ; avec 5×, près de 20 % ; avec 10×, près de 10 % ; avec 20×, près de 5 % ; avec 50×, près de 2 % ; et avec 100×, près de 1 %. Plus l'effet de levier est élevé, plus le mouvement qui t'élimine est petit. Une journée normale sur le marché des cryptos peut avoir des oscillations de cette taille.

:::alerta
Avec un effet de levier élevé, un petit mouvement normal peut liquider la position. Pas besoin d'une nouvelle catastrophique. Une oscillation d'une seule journée suffit.
:::

:::ecra Exemple · position ouverte (illustratif)
Marge : 100 €
Effet de levier : 10×
Valeur contrôlée : 1 000 €
Liquidation approximative : baisse d'environ 10 %, sans frais
État : ouverte
:::

:::curso Leçon 8.2 · Perpétuels et effet de levier
Avec un effet de levier de 10×, une baisse de 10 % contre toi peut effacer toute la marge de cette position. Ce n'est pas de la théorie, c'est de l'arithmétique.

dans le cours : tu fais le calcul de la liquidation sur trois exemples et tu comprends pourquoi c'est le dernier module, et non le premier.
:::

## Pourquoi ne pas commencer par là

Je ne commencerais pas par les perpétuels. Ce n'est pas une interdiction, c'est une question d'ordre. D'abord tu comprends la monnaie, le portefeuille, la sécurité, l'achat régulier et les impôts. Ensuite, si cela a du sens, tu étudies les dérivés plus calmement. Celui qui commence par la fin du parcours perd souvent de l'argent et confiance en même temps.

Il y a aussi un problème psychologique. Avec l'effet de levier, chaque oscillation semble urgente. Tu commences à regarder le prix toutes les minutes, à faire des calculs de tête et à décider sur un coup de tête. Cette tension coûte cher.

:::conversa Telegram · Gonçalo
Gonçalo: J'ai vu une vidéo d'un mec qui fait du 50x, ça a l'air facile !
eu: Avant le 50x, fais le calcul de la liquidation. Avec 50x, un mouvement d'environ 2 % suffit à fermer ta position.
Gonçalo: Ah... je n'avais pas fait ce calcul.
:::

## Exemple illustratif : le même mouvement, deux réalités

**Exemple illustratif**, avec des valeurs inventées et rondes. Inès achète 100 € d'une monnaie au comptant. Le prix baisse de 10 %. Il lui reste 90 €, elle a perdu 10 €, et elle peut attendre.

Tiago ouvre une position de 100 € avec un effet de levier de 10×, c'est-à-dire qu'il contrôle 1 000 €. Le prix baisse de 10 %. La perte est de 100 €, soit la marge entière. Il ne lui reste rien, et il n'a pas le temps de décider. Ils ont vu le même mouvement de marché, et le résultat a été radicalement différent. Ces chiffres servent à illustrer la logique, ce ne sont ni une prévision ni une norme.

:::cartao Avant d'utiliser l'effet de levier
- Est-ce que je sais à quel prix la position est liquidée ?
- Est-ce que je peux perdre toute la marge sans que cela me touche ?
- Est-ce que j'ouvre ça sur un coup de tête, ou selon un plan écrit ?
- Est-ce que j'ai bien compris les bases du livre (monnaie, portefeuille, impôts) ?
:::

## Exercice : le calcul de la liquidation

:::exercicio Quelle baisse du marché te liquiderait ?
1. Choisis une marge hypothétique, par exemple 100 €.
2. Choisis un effet de levier hypothétique, par exemple 5×.
3. Calcule : 100 ÷ 5 = 20 %. C'est l'approximation de la baisse du prix nécessaire pour liquider la position, sans compter les frais.
4. Refais le calcul avec 10× et avec 20×. Écris les trois résultats.
5. Demande-toi : si je me réveillais demain avec ce mouvement, comment réagirais-je ?

____________________________________________________________

____________________________________________________________
:::

## Une petite histoire

:::historia
Cas illustratif : Gonçalo, 27 ans, technicien logistique à Aveiro, a vu une vidéo de quelqu'un qui gagnait beaucoup avec les perpétuels. Il a ouvert une position avec un effet de levier élevé, sans comprendre la liquidation. Un mouvement normal du marché l'a fermée en quelques minutes. Ce n'était pas la fin du monde, parce que le montant était faible, mais ce fut une leçon coûteuse. Aujourd'hui, il enseigne ce qu'il a appris à ceux qui commencent.
:::

:::nota
Aujourd'hui : fais le calcul de l'exercice avec tes chiffres hypothétiques, et n'ouvre aucune position, même simulée, avant de l'avoir fait.
:::

## En résumé

- Les perpétuels sont des dérivés : des paris avec effet de levier, sans date d'échéance.
- L'effet de levier multiplie les gains et les pertes de la même façon.
- La liquidation ferme automatiquement la position quand la marge est épuisée.
- Plus l'effet de levier est élevé, plus le mouvement qui t'élimine est petit.
- Pour un débutant, l'ordre juste est de comprendre d'abord les bases.

Contenu éducatif, ne constitue pas un conseil financier. Avec les perpétuels, tu peux perdre la totalité de la marge en très peu de temps.

## À faire aujourd'hui

1. Choisis une marge hypothétique de 100 € et un effet de levier de 5×, puis fais le calcul de la liquidation.
2. Refais le calcul avec 10× et 20×, et écris les trois résultats sur papier.
3. Écris la question que tu te poserais si tu te réveillais demain avec ce mouvement.
4. Si tu as encore envie d'ouvrir une position, attends une semaine et refais le calcul.
