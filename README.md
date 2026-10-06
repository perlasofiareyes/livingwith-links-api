# livingwith-links-api

Backend del link-in-bio de **@livingwith_sofiaa**. Sirve el contenido de la página (links, favoritos, posts del blog), guarda solicitudes de colaboración y cuenta clicks por link.

Frontend: [`livingwith-links-front`](https://github.com/perlasofiareyes/livingwith-links-front)

## Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/health` | Healthcheck para Railway |
| GET | `/api/site` | Perfil, links, favoritos, info de colabs y lista de posts |
| GET | `/api/posts` | Lista de posts (sin el cuerpo) |
| GET | `/api/posts/:slug` | Post completo (Markdown) |
| POST | `/api/collab` | Guarda una solicitud de colaboración |
| GET | `/api/collab?token=ADMIN_TOKEN` | Ver solicitudes (privado) |
| POST | `/api/click` | Suma un click a un link `{ "id": "tiktok" }` |
| GET | `/api/stats?token=ADMIN_TOKEN` | Clicks por link (privado) |

## Editar contenido

- **Links, favoritos, bio:** `content/site.json`
  - Un link con `"url": ""` y `"status": "soon"` aparece como "pronto" — pega la URL real cuando la tengas (Canva, Pinterest).
  - Favoritos: agrega objetos a `"favorites"` así:
    ```json
    { "category": "Running", "name": "Nombre del producto", "note": "Por qué me gusta", "url": "https://..." }
    ```
- **Posts / tips:** agrega un `.md` en `content/posts/` (copia `_plantilla.md`). Los posts con `draft: true` no se publican.

Haz commit + push a `main` y Railway redeploya solo.

## Correr local

```bash
npm run dev     # http://localhost:3000
```

## Deploy en Railway

1. En [railway.com](https://railway.com) → **New Project → Deploy from GitHub repo** → elige `livingwith-links-api`.
2. Railway detecta Node y usa `npm start`. El healthcheck es `/health` (ya está en `railway.json`).
3. **Variables** (pestaña *Variables*):
   - `ADMIN_TOKEN` — una contraseña larga para ver colabs y stats
   - `ALLOWED_ORIGINS` — `https://perlasofiareyes.github.io` (y `http://localhost:5173` si pruebas local)
   - `DATA_DIR` — `/data` (solo si agregas un volumen)
4. **Volumen (recomendado):** *Add Volume* montado en `/data`, para que las colabs y clicks no se borren en cada deploy.
5. **Settings → Networking → Generate Domain** y copia esa URL al `config.js` del frontend.

### Sobre el costo

El plan **Free** de Railway incluye **$1 USD de crédito al mes** (0.5 GB RAM). Un server chiquito como este debería caber, pero no está garantizado. Si el crédito se acaba, el servicio se detiene — **la página no se cae**, porque el frontend (GitHub Pages) tiene una copia de respaldo del contenido. Lo único que dejaría de funcionar es el formulario de colabs y el conteo de clicks. Para no depender de eso, el plan **Hobby** cuesta $5 USD/mes.
