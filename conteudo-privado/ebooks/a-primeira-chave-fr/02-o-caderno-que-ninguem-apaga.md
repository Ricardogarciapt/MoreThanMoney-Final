# Le cahier que personne n'efface

> Une blockchain est un cahier que tout le village lit et que personne ne peut déchirer seul.

Imagine un petit village où tout le monde se connaît. Il y a un cahier sur la place où l'on note qui doit quoi à qui. Quand le boulanger vend du pain à crédit au forgeron, on écrit la ligne : « le forgeron doit 5 € au boulanger ». Pendant des années, le cahier reste entre les mains de l'épicier, qui s'en occupe. Le problème est évident : et si l'épicier était malhonnête et arrachait les pages qui ne l'arrangent pas ?

La solution du village est simple. Au lieu d'un seul cahier gardé par une personne, il y a une copie chez chaque famille. Quand quelqu'un écrit une nouvelle ligne, toutes les copies sont mises à jour. Pour tricher, il faudrait modifier la majorité des copies en même temps, ce qui est beaucoup plus difficile que d'arracher une seule page.

C'est l'intuition qui se cache derrière la blockchain. C'est un registre partagé, copié par de nombreux ordinateurs, où les transactions sont organisées en blocs reliés les uns aux autres.

[[grafico:blockchain-caderno]]

## Ce qu'est un bloc

Chaque bloc est une page du cahier. Il contient un ensemble de transactions (qui a envoyé quoi à qui), un horodatage et une empreinte digitale de la page précédente, appelée hash. Cette empreinte relie un bloc au précédent. Si quelqu'un change une virgule dans une page ancienne, l'empreinte change et le lien avec les pages suivantes se rompt. Tout le réseau détecte l'incohérence.

Pas besoin de savoir faire des calculs pour comprendre l'idée. Imagine simplement des pages collées les unes aux autres avec une colle qui se détériore dès que quelqu'un touche à un détail.

L'empreinte, le hash, fonctionne comme un sceau de cire qui ne sert que pour cette lettre-là. Si la lettre est ouverte et refermée avec un texte différent, le sceau ne correspond plus. Pas besoin de savoir comment le hash est calculé pour comprendre qu'il est sensible à toute modification, aussi minime soit-elle. C'est cette sensibilité qui rend le cahier difficile à falsifier.

:::destaque
Dans la blockchain, on ne fait pas confiance à une personne. On fait confiance aux règles et au nombre de copies indépendantes du registre.
:::

:::post @morethanmoney.pt
imagem: Un cahier que personne n'efface.
legenda: Voilà ce qu'est une blockchain. Sans jargon, sans magie : un registre public que des milliers d'ordinateurs conservent en même temps. Si quelqu'un te dit que c'est plus compliqué que ça, c'est qu'il veut te vendre quelque chose.
:::

## Comment on se met d'accord, avec le minage et la proof-of-stake

Si tout le monde pouvait écrire des pages en même temps, le cahier deviendrait confus. Il faut une règle pour décider qui écrit la page suivante et qui la valide. Il existe deux grandes façons de le faire.

**Proof-of-work (preuve de travail).** C'est la méthode utilisée par le Bitcoin. Les participants, appelés mineurs, rivalisent pour résoudre un problème mathématique difficile. Celui qui le résout en premier écrit le bloc et reçoit une récompense. L'idée est que modifier le passé coûterait tellement cher en énergie et en matériel que cela ne vaudrait pas la peine. Le coût est réel et consomme beaucoup d'électricité.

**Proof-of-stake (preuve d'enjeu).** C'est la méthode utilisée par Ethereum depuis septembre 2022, lors d'un moment appelé The Merge. Au lieu de dépenser de l'énergie en calculs, celui qui veut valider des blocs bloque une quantité de la monnaie elle-même comme garantie. S'il valide mal, il peut perdre cette garantie. La logique est que celui qui a beaucoup à perdre a des raisons de bien se comporter.

Les deux méthodes poursuivent le même objectif : personne ne décide seul de ce qui est vrai dans le cahier.

## Pourquoi cela intéresse ceux qui débutent

La blockchain explique pourquoi les transactions en crypto sont, en règle générale, irréversibles. Si tu envoies de l'argent à la mauvaise adresse, aucune banque ne peut annuler l'opération. Aucun service client ne peut faire un remboursement. Cette caractéristique est un avantage pour qui ne veut pas de censure, mais c'est un danger pour qui se trompe ou se fait tromper.

:::alerta
Une transaction envoyée sur une blockchain publique ne peut pas être annulée. Avant de confirmer, vérifie l'adresse, le réseau et le montant. Deux fois, s'il le faut.
:::

:::ecra Portefeuille · Confirmer l'envoi (exemple)
Pour : 0x7a...f3 (adresse d'exemple)
Réseau : choisis le réseau avant d'envoyer
Montant : 50,00 €
Frais de réseau (exemple) : 0,40 €
Statut : en attente de confirmation
:::

:::historia
Cas illustratif : Inês, la même infirmière de Coimbra que dans le premier chapitre, voulait envoyer 50 € en crypto à une amie. Elle a copié l'adresse, mais seulement la moitié, parce que le téléphone a coupé la ligne. Elle ne s'en est rendu compte qu'après avoir confirmé. Il n'y avait personne à qui demander un remboursement. Ce n'était pas un drame, mais une leçon : la liberté de la blockchain exige de la prudence humaine.
:::

:::conversa WhatsApp · Amie (exemple)
Amie: Tu m'as bien envoyé les 50 ?
eu: Envoyé. Mais j'ai mal copié l'adresse, quelle bêtise.
Amie: Et maintenant ?
eu: Maintenant il n'y a pas de retour possible. Alors vérifie toujours deux fois.
:::

## Exercice avec papier et crayon

:::exercicio Un registre de trois blocs
1. Sur une feuille, dessine trois carrés reliés par des flèches. Chaque carré est un bloc.
2. À l'intérieur de chaque carré, écris une transaction imaginaire entre deux personnes de ta famille.
3. Dans un des carrés du milieu, change une valeur. Demande-toi quels carrés deviennent « suspects » après cela.
4. Écris, en une phrase, pourquoi la copie partagée rend la fraude plus difficile.

____________________________________________________________

____________________________________________________________
:::

:::cartao Avant de confirmer tout envoi
- Vérifie l'adresse, lettre par lettre, et pas seulement le début et la fin.
- Confirme le réseau. Si le réseau est le mauvais, l'argent peut ne jamais arriver.
- Vérifie le montant et les frais. Ne te fie pas seulement à ce que dit le bouton.
:::

## En résumé

- Une blockchain est un registre partagé, organisé en blocs reliés entre eux.
- Modifier un bloc ancien oblige à modifier tous les suivants, ce qui est difficile et visible.
- Le Bitcoin utilise la proof-of-work (minage) ; Ethereum est passé à la proof-of-stake en septembre 2022.
- Les transactions sur les blockchains publiques sont, en règle générale, irréversibles.
- La sécurité commence par toi : vérifie toujours l'adresse, le réseau et le montant.

## À faire aujourd'hui

1. Choisis une transaction réelle que tu as déjà faite (un virement, un paiement) et demande-toi qui pourrait l'annuler.
2. Compare la réponse avec le fonctionnement de la blockchain. La différence va te rester en mémoire.
3. Garde dans ton téléphone une note avec les trois questions de la carte ci-dessus, pour les relire avant tout envoi.
