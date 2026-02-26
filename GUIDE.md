# Guide VIKTA — Outil de maquettage IA pour Product Owners

## Sommaire
1. [Installation du Proxy VIKTA (Mac)](#1-installation-du-proxy-vikta-mac)
2. [Installation du Proxy VIKTA (Windows)](#2-installation-du-proxy-vikta-windows)
3. [Préparer les fichiers VIKTA](#3-préparer-les-fichiers-vikta)
4. [Configurer l'IA](#4-configurer-lia)
5. [Concept général de l'outil](#5-concept-général-de-loutil)
6. [Préparer une tâche](#6-préparer-une-tâche)
7. [Gérer les écrans](#7-gérer-les-écrans)
8. [Générer un écran avec l'IA](#8-générer-un-écran-avec-lia)
9. [Discuter avec l'IA](#9-discuter-avec-lia)
10. [Éditer le HTML manuellement](#10-éditer-le-html-manuellement)
11. [Exporter son travail](#11-exporter-son-travail)
12. [Problèmes fréquents](#12-problèmes-fréquents)

---

## 1. Installation du Proxy VIKTA (Mac)

Le Proxy VIKTA est une petite application qui tourne en arrière-plan sur ton Mac. Elle permet à l'outil VIKTA d'envoyer des fichiers (Excel, PDF, Word…) à l'IA — ce qui n'est pas possible autrement.

### Installer l'application

1. Télécharge le fichier **Proxy VIKTA.dmg** depuis le lien fourni
2. Double-clique sur le `.dmg`
3. Fais glisser **Proxy VIKTA** dans le dossier **Applications**
4. Éjecte le disque (clic droit → Éjecter)

### Premier lancement — message de sécurité macOS

Apple bloque les apps non signées. Pour contourner :

1. Va dans **Applications** dans le Finder
2. **Clic droit** sur **Proxy VIKTA** → **Ouvrir**
3. Clique sur **Ouvrir** dans la boîte de dialogue

> Cette manipulation n'est nécessaire qu'**une seule fois**.

### Usage quotidien

- Lance **Proxy VIKTA** depuis les Applications avant d'ouvrir VIKTA.html
- La fenêtre peut être réduite — le serveur continue de tourner
- Le point **vert** = serveur actif, le point **rouge** = arrêté

---

## 2. Installation du Proxy VIKTA (Windows)

Le Proxy VIKTA est une petite application qui tourne en arrière-plan sur ton PC. Elle permet à l'outil VIKTA d'envoyer des fichiers (Excel, PDF, Word…) à l'IA.

### Installer l'application

1. Télécharge le fichier **Proxy VIKTA Setup.exe** depuis le lien fourni
2. Double-clique sur le fichier téléchargé
3. Windows peut afficher un avertissement **"Windows a protégé votre ordinateur"** (SmartScreen) — clique sur **Informations complémentaires** puis **Exécuter quand même**
4. L'installation se fait automatiquement (pas de questions à répondre)
5. Un raccourci **Proxy VIKTA** apparaît dans le menu Démarrer

> L'avertissement SmartScreen est normal pour toute application non signée. L'installation se fait dans ton profil utilisateur, sans droits administrateur.

### Usage quotidien

- Lance **Proxy VIKTA** depuis le menu Démarrer avant d'ouvrir VIKTA.html
- La fenêtre peut être **réduite** dans la barre des tâches — le serveur continue de tourner
- Le point **vert** = serveur actif, le point **rouge** = arrêté
- Pour quitter complètement : clique sur **Arrêter** dans la fenêtre, puis ferme-la

---

## 3. Préparer les fichiers VIKTA

L'outil VIKTA est constitué de **trois fichiers indissociables** qui doivent impérativement se trouver dans le **même dossier** :

| Fichier | Rôle |
|---------|------|
| `VIKTA.html` | L'outil principal — c'est ce fichier que tu ouvres dans le navigateur |
| `vikta-task.css` | Les styles graphiques — sans lui l'interface est cassée |
| `vikta-task.js` | Toute la logique de l'outil — sans lui rien ne fonctionne |

### Comment obtenir ces fichiers

Demande-les à ton référent technique. Place les trois fichiers dans un dossier sur ton Mac ou PC, par exemple :
- Mac : `Documents/VIKTA/`
- Windows : `C:\Tempo\VIKTA\`

### Ouvrir l'outil

- **Mac** : double-clique sur `VIKTA.html` → s'ouvre dans Safari, ou fais glisser le fichier dans Chrome
- **Windows** : double-clique sur `VIKTA.html` → s'ouvre dans le navigateur par défaut

> N'utilise jamais un lien distant ou une URL partagée — l'outil doit être ouvert depuis ton disque local pour fonctionner correctement.

---

## 4. Configurer l'IA

### Dans Proxy VIKTA (une seule fois)

1. La fenêtre s'ouvre au lancement
2. Entre ta **clé API OpenAI** (commence par `sk-...`) et/ou ta **clé API Anthropic** (commence par `sk-ant-...`)
3. Clique **Enregistrer** → le point devient vert

### Dans VIKTA.html

1. Ouvre **VIKTA.html** dans Safari ou Chrome
2. Clique sur **Paramètres IA** (en haut à droite)
3. Sélectionne le mode **Proxy**
4. URL du proxy : `http://localhost:3000/vikta-ai`
5. Choisis ton fournisseur : **OpenAI (ChatGPT)** ou **Anthropic (Claude)**
6. Choisis tes modèles (les valeurs par défaut sont un bon point de départ)
7. Clique **Enregistrer**

> **Conseil modèles :** GPT-5 Mini ou Claude Haiku offrent un bon équilibre qualité/coût pour le quotidien. Réserve GPT-5 ou Claude Sonnet pour les tâches complexes.

> **Coût** : le compteur en haut de page affiche le coût estimé de la session en cours (en dollars).

---

## 5. Concept général de l'outil

VIKTA est un **outil de maquettage fonctionnel assisté par IA**. Il permet de :

- Décrire une tâche produit (nom, contexte, objectifs)
- Générer des **maquettes HTML** à partir de documents (Excel, PDF, Word, PowerPoint) ou d'une description textuelle
- Affiner les maquettes par itérations successives
- Exporter les maquettes pour les développeurs ou pour JIRA

**Ce que l'outil produit :**
L'IA génère du HTML fonctionnel fidèle aux conventions VIKTA — pas un rendu graphique pixel-perfect, mais une structure métier prête à être branchée par les développeurs.

**Ce que l'outil ne fait pas :**
- Il n'envoie pas de tâches dans JIRA automatiquement (l'export fournit un CSV à importer)
- Il ne modifie pas le vrai produit
- Il ne remplace pas la revue avec l'équipe dev

---

## 6. Préparer une tâche

### Nom de la tâche

En haut de page, remplis le champ **Nom de la tâche** — c'est obligatoire pour sauvegarder. Ce nom sera utilisé comme nom de fichier.

### Clé JIRA (optionnel)

Si tu as une référence JIRA (ex : `VIKT-123`), entre-la. Elle apparaîtra dans l'export CSV.

### Définition de la tâche

La zone de texte sous le nom de la tâche est un **éditeur de texte enrichi**. Décris ici :
- Le contexte métier
- Les règles fonctionnelles
- Les contraintes ou cas particuliers

La barre d'outils permet de mettre en **gras**, *italique*, ajouter des titres et des listes.

> Cette définition est incluse dans chaque prompt envoyé à l'IA. Plus elle est précise, meilleure sera la génération.

### Dossier de travail

Au premier lancement, l'outil propose de choisir un **dossier de travail**. Ce dossier sera utilisé par défaut pour sauvegarder et ouvrir tes fichiers. Tu peux le passer et le configurer plus tard.

---

## 7. Gérer les écrans

### Ajouter un écran

Clique sur **+ Ajouter un écran** dans la barre en haut. Chaque écran correspond à une page ou vue de ton module.

### Nommer un écran

Chaque écran a un champ de titre. Nomme-le clairement (ex : *Liste des déclarations*, *Popup de confirmation*).

### Réorganiser les écrans

Utilise la poignée **⋮⋮** (à gauche de chaque écran) pour les glisser-déposer dans l'ordre souhaité.

### Réduire / Développer un écran

Clique sur la flèche **›** à droite de l'en-tête pour replier un écran et gagner de la place.

### Mode focus

Le bouton **Focus aperçu** masque les contrôles et n'affiche que la maquette — utile pour une présentation.

### Supprimer un écran

Le bouton **Supprimer** (en bas de chaque écran) demande confirmation avant de supprimer.

---

## 8. Générer un écran avec l'IA

C'est la fonctionnalité principale de VIKTA.

### Charger un fichier source (optionnel mais recommandé)

Clique sur **Charger un fichier HTML…** — en réalité ce bouton accepte aussi **Excel, PDF, Word et PowerPoint**.

Le fichier est extrait et son contenu textuel envoyé à l'IA comme source de données.

> **Excel :** l'IA génère un formulaire/tableau reproduisant la structure exacte du fichier.
> **Word :** interprété comme une spécification fonctionnelle — l'IA génère un module complet.
> **PowerPoint :** chaque slide devient une section de l'écran.

### Ajouter des images (optionnel)

Tu peux **coller** (`Cmd+V`) ou **glisser-déposer** des captures d'écran ou maquettes Canva directement dans la zone de chat. L'IA les analyse pour s'en inspirer.

### Rédiger les objectifs de l'écran

La zone **Objectifs / règles de l'écran** précise à l'IA ce que doit faire cet écran spécifiquement. Exemple :
> *"Tableau de liste avec filtre par statut et bouton Ajouter. Popup de saisie avec validation."*

### Lancer la génération

Clique sur **Générer avec l'IA**. La génération prend 10 à 60 secondes selon la complexité.

### Affiner par itérations

La case **Inclure le HTML actuel** permet de régénérer en partant de la maquette existante. Utilise le champ de prompt libre pour donner des instructions précises :
> *"Ajoute une colonne Montant dans le tableau et une barre de recherche en haut."*

Clique à nouveau sur **Générer avec l'IA**.

> **Astuce :** génère d'abord une première version globale, puis affine par petites touches avec le prompt libre.

---

## 9. Discuter avec l'IA

Le bouton **💬 Discuter** ouvre un chat lié à l'écran en cours.

### À quoi ça sert ?

- Poser des questions sur la maquette générée
- Demander des explications sur des choix de structure
- Tester une logique métier avant de régénérer

### Comment l'utiliser

1. Tape ta question ou instruction dans la zone de texte
2. Clique sur **Discuter** ou appuie sur `Entrée`
3. L'IA répond en texte (sans régénérer le HTML)

Tu peux également **joindre des fichiers ou images** dans le chat (même méthode qu'en génération).

> L'historique de conversation est conservé par écran pendant toute la session.

---

## 10. Éditer le HTML manuellement

Si tu veux corriger un détail sans relancer l'IA :

1. Clique sur **✏️ Éditer HTML**
2. Le code source de l'écran apparaît dans une zone de texte
3. Modifie directement le HTML
4. Clique sur **✅ Valider HTML** pour voir le résultat

> Réservé aux utilisateurs à l'aise avec le HTML. Une erreur de syntaxe peut casser l'affichage.

---

## 11. Exporter son travail

### Sauvegarder la session (pour continuer plus tard)

Clique sur **Sauvegarder** dans la barre en haut. Cela sauvegarde un fichier `.html` contenant tout ton travail — tâche, écrans, HTML généré. Tu peux le rouvrir plus tard avec **Ouvrir une tâche**.

### Exporter un écran seul

Le bouton **Exporter HTML** (sur chaque écran) sauvegarde le HTML de cet écran seul, tel quel.

### Exporter la maquette autonome

**Exporter maquette autonome** génère un seul fichier HTML autonome contenant tous tes écrans, avec :
- Navigation Précédent / Suivant
- Définition de la tâche en section repliable
- Optionnellement une version bilingue FR/EN (si l'IA est configurée)

Idéal pour partager une démo avec un stakeholder.

### Exporter le workspace JIRA

**Exporter workspace pour JIRA (FR + EN)** ne pas utiliser pour le moment - en cours de discussion

---

## 12. Problèmes fréquents

**Le Proxy VIKTA ne s'ouvre pas au premier lancement**
→ Utilise clic droit → Ouvrir (voir section 1)

**Point rouge dans Proxy VIKTA — "Erreur : adresse déjà utilisée"**
→ Une instance tourne déjà. Clique sur Arrêter, attends 2 secondes, puis Démarrer.

**Erreur "Proxy : 500" dans VIKTA.html**
→ Vérifie que le point est vert dans Proxy VIKTA. Si les clés ont été changées, re-saisis-les et clique Enregistrer.

**La génération ne produit pas de HTML valide**
→ Reformule les objectifs de l'écran avec plus de précision. Évite les instructions trop vagues ("fais un bel écran").

**L'IA ne tient pas compte du fichier chargé**
→ Vérifie que le fichier a bien été chargé (il doit apparaître dans la liste des fichiers). Les fichiers volumineux sont tronqués à 8 000 caractères.

**L'export workspace est très lent**
→ C'est normal si tu as beaucoup d'écrans — la traduction de chaque écran prend quelques secondes. Laisse tourner.

**Je veux changer de provider (OpenAI ↔ Claude)**
→ Clique sur Paramètres IA, change le fournisseur, clique Enregistrer. La page se recharge (les écrans sont conservés si tu as sauvegardé).
