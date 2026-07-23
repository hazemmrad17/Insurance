# Previa — démarrage local

Previa est une application d'assurance composée de deux services :

- `packages/front` : interface TypeScript/Vite, sur `http://localhost:5173`
- `packages/api` : API Hono et base SQLite, sur `http://localhost:3001`

## Prérequis

- Node.js 20 ou plus récent
- npm

## Première installation

Depuis le dossier racine du projet :

```powershell
npm ci
Copy-Item packages/api/.env.example packages/api/.env
Copy-Item packages/front/.env.example packages/front/.env
npm run db:push
npm run db:seed
```

Les clés Géorisques, BDNB et Mapbox sont facultatives pour un premier lancement. Remplacez toutefois `JWT_SECRET` dans `packages/api/.env` par une longue valeur aléatoire avant toute mise en ligne.

## Lancer l'application

Ouvrez deux terminaux dans le dossier racine.

Terminal 1 — API :

```powershell
npm run dev:api
```

Terminal 2 — interface :

```powershell
npm run dev:front
```

Ouvrez ensuite `http://localhost:5173`.

Compte de démonstration :

- email : `demo@previa.fr`
- mot de passe : `Previa2026!`

## Vérifications utiles

```powershell
# L'API doit répondre avec status: "ok"
Invoke-RestMethod http://localhost:3001/health

# Compiler le frontend
npm run build

# Compiler l'API
npm run build --workspace=packages/api
```

Si l'authentification échoue après un nouveau téléchargement, rejouez `npm run db:push` puis `npm run db:seed`.

## Variables facultatives

- `VITE_MAPBOX_TOKEN` active le style Mapbox ; un fond CARTO est utilisé sinon.
- `VITE_GEORISQUES_V2_TOKEN` active les appels Géorisques v2 côté interface.
- `GEORISQUES_V2_TOKEN` et `BDNB_API_KEY` configurent les services externes côté API.

Les fichiers `.env` et la base SQLite sont ignorés par Git afin de ne pas publier les secrets et données locales.
