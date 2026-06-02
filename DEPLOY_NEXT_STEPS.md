# Termer Render Blueprint Next Steps

This repo is ready to create both Termer services from `render.yaml`.

## What You Click In Render

1. Open [Render Dashboard](https://dashboard.render.com/).
2. Click `New +`.
3. Click `Blueprint`.
4. Select repo `SaeedMoghrabi/Termer`.
5. Select branch `upload-termer`.
6. Confirm Render found [render.yaml](C:\Users\Saeed\Desktop\Myver\CoursePlannerr\CMPS-271\render.yaml).
7. Review the two services Render will create or update:
   - `termer-api`
   - `termer-frontend`
8. When Render asks for secret env vars, fill them in.
9. Click `Apply` or `Create Blueprint`.

## Secret Values Render Will Ask You For

### termer-api
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

### termer-frontend
- `VITE_SUPABASE_ANON_KEY`

## Expected Service Shapes

### termer-api
- Type: Web Service
- Runtime: Node
- Root directory: repo root
- Build command:
  `npm install --legacy-peer-deps && npx playwright install chromium`
- Start command:
  `npm start`

### termer-frontend
- Type: Static Site
- Root directory:
  `CoursePlannerr`
- Build command:
  `npm install --legacy-peer-deps && npm run build`
- Publish directory:
  `dist`

## After Blueprint Creation

1. Wait for both services to finish deploying.
2. Copy the generated URLs for:
   - `termer-api`
   - `termer-frontend`
3. Compare those URLs against the placeholder values in the Blueprint.

## If Render Generates Different Subdomains

Update these values in Render if the generated frontend URL is not exactly:
`https://termer-frontend.onrender.com`

### termer-api
- `PUBLIC_SITE_URL`
- `ALLOWED_ORIGINS`

### termer-frontend
- `VITE_PUBLIC_SITE_URL`

## API URL Wiring

The Blueprint attempts to auto-wire:

- `termer-frontend` -> `VITE_API_URL`
- from `termer-api` -> `RENDER_EXTERNAL_URL`

If Render accepts that link, no manual edit is needed.

If Render does **not** resolve it correctly, manually set:

`VITE_API_URL=https://<your-termer-api-subdomain>.onrender.com`

Then redeploy only `termer-frontend`.

## Supabase URL Configuration After Frontend URL Is Known

Open [Supabase Dashboard](https://supabase.com/dashboard/), then:

1. Open your project.
2. Go to `Authentication`.
3. Open `URL Configuration`.
4. Set `Site URL` to:
   `https://<your-termer-frontend-subdomain>.onrender.com`
5. Add Redirect URLs:
   - `https://<your-termer-frontend-subdomain>.onrender.com/login?confirmed=true`
   - `https://<your-termer-frontend-subdomain>.onrender.com/update-password`

If you later switch to the final custom domain:
- `https://termer.app`

Then update Supabase again:
- `Site URL` -> `https://termer.app`
- Redirect URLs:
  - `https://termer.app/login?confirmed=true`
  - `https://termer.app/update-password`

## Existing Manual Static Site

If your existing `Termer-frontend` static site is the same service in the same Render workspace, the Blueprint can usually adopt and update it by name.

If that existing site is misconfigured, points to the wrong repo, or you want a clean recreation, delete it first and then apply the Blueprint.
