# Mesurer la netteté réelle de l'imagerie satellite sur le campus

Objectif : trouver le zoom au-delà duquel l'image n'apporte plus de détail (simple agrandissement de
pixels) pour le fournisseur configuré (`VITE_MAP_PROVIDER=maptiler`), puis le fixer sans modifier le code.
Ce test n'a **pas** pu être réalisé par l'équipe de développement (pas d'accès réseau aux fournisseurs).

## Protocole (5–10 minutes, sur ordinateur)
1. Ouvrez le site, passez en **Satellite**, centrez sur le campus.
2. Ouvrez les outils de développement → onglet **Réseau**, filtrez sur « Img » ou sur le nom du fournisseur.
3. Zoomez pas à pas (un niveau à la fois). À chaque niveau, notez : le niveau de zoom (`/z/x/y` dans l'URL des
   tuiles), le code HTTP (200 / 404 / 204), et si l'image gagne réellement en détail (toits, véhicules, arbres
   isolés distincts) ou devient seulement plus grosse et floue.
4. Le **dernier niveau où l'image gagne en détail** est le zoom utile `Z`.
5. Faites la même chose en **Hybride**, et sur mobile (écran haute densité : l'image paraît plus molle à
   niveau égal).
6. Fixez `VITE_MAP_MAXZOOM_SATELLITE=Z` sur Render, puis **relancez un déploiement** (variable lue au build).

## Si Z est trop bas pour l'usage (ex. < 18)
Le fournisseur n'a pas d'imagerie assez fine sur Kinshasa. Options à comparer (vérifier licence, quotas,
conditions d'usage et clé API avant tout) : Esri World Imagery, Mapbox Satellite, autre fournisseur
commercial ; ou une imagerie propre au campus (survol par drone) servie comme source personnalisée.
Aucune de ces solutions n'a été testée ici.

## Clé API
La clé de carte est visible dans le navigateur : restreignez-la à vos domaines (HTTP referrers) dans le
tableau de bord du fournisseur. Une clé qui a été partagée dans une conversation ou un document doit être
considérée comme exposée : régénérez-la et mettez à jour la variable Render.
