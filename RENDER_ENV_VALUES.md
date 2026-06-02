# Termer Render Environment Values

This file lists the intended Render environment values for both services.

## termer-api

### Non-secret values

- `NODE_ENV=production`
- `NODE_VERSION=20`
- `PUBLIC_SITE_URL=https://termer-frontend.onrender.com`
- `ALLOWED_ORIGINS=https://termer-frontend.onrender.com,https://termer.app,https://www.termer.app`
- `TRUST_PROXY=true`
- `ENFORCE_CANONICAL_ORIGIN=false`
- `ENABLE_HSTS=false`
- `CATALOG_AUTO_REFRESH=true`
- `CATALOG_AUTO_REFRESH_ON_START=false`
- `CATALOG_REFRESH_INTERVAL_MINUTES=2`

### Secret values

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

These are intentionally marked `sync: false` in [render.yaml](C:\Users\Saeed\Desktop\Myver\CoursePlannerr\CMPS-271\render.yaml).

## termer-frontend

### Non-secret values

- `VITE_PUBLIC_SITE_URL=https://termer-frontend.onrender.com`
- `VITE_APP_BASE_PATH=/`
- `VITE_SUPABASE_URL=https://wymsmputeifyemyprlpt.supabase.co`

### API wiring

Preferred:

- `VITE_API_URL` auto-wired from:
  - service: `termer-api`
  - env var key: `RENDER_EXTERNAL_URL`

If Render does not resolve that automatically in your workspace, set it manually to:

- `VITE_API_URL=https://<your-termer-api-subdomain>.onrender.com`

Then redeploy `termer-frontend`.

### Secret values

- `VITE_SUPABASE_ANON_KEY`

This is intentionally marked `sync: false` in [render.yaml](C:\Users\Saeed\Desktop\Myver\CoursePlannerr\CMPS-271\render.yaml).

## Values That May Need Updating After Render Creates Real URLs

If Render gives you generated subdomains that differ from `https://termer-frontend.onrender.com`, update:

### termer-api
- `PUBLIC_SITE_URL`
- `ALLOWED_ORIGINS`

### termer-frontend
- `VITE_PUBLIC_SITE_URL`

## Final Custom Domain Phase

When you switch to the final domain:

- frontend: `https://termer.app`
- backend custom domain if you later add one, for example:
  `https://api.termer.app`

Update the relevant env vars in Render and then update Supabase Auth URL Configuration to match.
