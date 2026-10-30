# Checklist de test sur téléphone (préproduction)

À faire sur **au moins un iPhone (Safari) et un Android (Chrome)**, en 4G puis en Wi-Fi, avec l'adresse de **préproduction**. Cochez ; notez le modèle, la version du système et le navigateur. Tout point non coché est un défaut à signaler avec une capture d'écran.

## A. Premier chargement
- [ ] La page d'accueil s'affiche sans défilement horizontal ; le texte est lisible au soleil (contraste) ; aucun élément coupé.
- [ ] Le menu (icône ☰) s'ouvre, se ferme, et chaque lien mène à la bonne page.
- [ ] Rotation portrait ↔ paysage : la page reste utilisable.
- [ ] Zoom du navigateur à 200 % : rien ne devient inaccessible.

## B. Carte et lieux
- [ ] La carte se charge (fond de plan visible) ; pincement/zoom et déplacement fluides.
- [ ] Les marqueurs sont touchables sans erreur ; la fiche d'un lieu s'ouvre et se ferme.
- [ ] Un lieu sans photo affiche « Photo non disponible » (pas d'image cassée).
- [ ] Recherche : taper « salle » ou un nom de bâtiment ; le résultat mène au bon lieu.

## C. Itinéraires (à faire **sur le campus**, avec le GPS)
- [ ] Autoriser la localisation : « Ma position » apparaît ; le point bleu est au bon endroit.
- [ ] Calculer 3 itinéraires réels : le tracé suit des chemins marchables ; la distance et la durée sont plausibles (comparer avec un autre outil).
- [ ] Mode avion pendant un calcul : message **« Erreur réseau »** et bouton **« Réessayer »** ; après retour du réseau, « Réessayer » affiche l'itinéraire.
- [ ] Refuser la localisation : le choix manuel du départ reste possible (liste ou point sur la carte).
- [ ] Ouvrir un lien/QR de destination **application fermée** : le départ se trouve, ou le choix manuel est proposé (jamais un écran bloqué).
- [ ] Aucun itinéraire n'est jamais tracé en ligne droite ; si aucun chemin n'existe, le message le dit clairement.

## D. Comptes
- [ ] Inscription, connexion, déconnexion, mot de passe oublié (si activé).
- [ ] Après actualisation de la page, la session est conservée.
- [ ] Un étudiant ne voit pas le menu d'administration ; l'adresse `#/admin` saisie à la main est refusée.

## E. Administration (compte autorisé)
- [ ] Administration → Données : l'inventaire se lit sur petit écran ; « Vérifier sur la carte » s'ouvre dans un nouvel onglet.
- [ ] Import d'un CSV **invalide** : le message indique la ligne ; rien n'est importé. Import d'un CSV valide de test : récapitulatif, case de relecture, importé en « non validé ».
- [ ] Photo : envoi (depuis l'appareil photo ET depuis la galerie, y compris un fichier sans extension), remplacement, légende, couverture, ordre, suppression. Couper le réseau pendant un envoi : message d'erreur, aucune photo à moitié enregistrée.
- [ ] Journal d'audit lisible ; un changement de rôle y apparaît.

## F. Affichage et accessibilité (non testés par l'équipe technique)
- [ ] Mode sombre (réglage du téléphone et de l'application) : textes lisibles partout.
- [ ] Taille de texte du système augmentée : rien ne se chevauche.
- [ ] Boutons faciles à toucher au pouce (aucun bouton trop petit ou collé à un autre).
- [ ] Lecteur d'écran (VoiceOver / TalkBack) : le bouton de position et les boutons de la carte sont annoncés avec un nom.

## G. Performances et réseau
- [ ] 4G moyenne : la carte devient utilisable en moins de ~5 s ; défilement sans saccades.
- [ ] Pas de chauffe anormale ni de forte consommation de batterie après 5 minutes de carte.
- [ ] Application installée (« Ajouter à l'écran d'accueil ») : s'ouvre en plein écran ; hors ligne, un message clair s'affiche pour les itinéraires.
