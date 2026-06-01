# Termer Domain Cutover Checklist

Use this when switching Termer from local access to a real public domain.

## 1. Decide the final canonical URL

Pick one public URL and treat it as the canonical production address.

Examples:

- `https://termer.example.com`
- `https://www.termer.example.com`

Use the exact same canonical URL in:

- DNS / hosting dashboard
- `PUBLIC_SITE_URL`
- `VITE_PUBLIC_SITE_URL`
- Supabase Site URL
- Supabase Redirect URLs

## 2. Prepare production environment variables

Start from:

- [C:\Users\Saeed\Desktop\Myver\CoursePlannerr\CMPS-271\.env.production.example](C:\Users\Saeed\Desktop\Myver\CoursePlannerr\CMPS-271\.env.production.example)

Required values:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `PUBLIC_SITE_URL`
- `VITE_PUBLIC_SITE_URL`
- `ALLOWED_ORIGINS`

Recommended production values:

- `TRUST_PROXY=true`
- `ENFORCE_CANONICAL_ORIGIN=true`
- `ENABLE_HSTS=true`

## 3. Update Supabase authentication settings

In Supabase Auth settings:

- set `Site URL` to your canonical public URL
- add redirect URLs for:
  - `https://your-domain.com/login?confirmed=true`
  - `https://your-domain.com/update-password`

If you serve under a subpath, add those exact subpath URLs too.

## 4. Point the domain to the actual host

The domain provider and the app host are separate concerns.

If the domain comes from a GitHub benefit, you still need to point DNS to wherever Termer is actually hosted.

That means one of:

- a `CNAME` record to your platform hostname
- `A` / `AAAA` records to your server IP
- reverse proxy / tunnel target if you are publishing from your own server

## 5. Build and verify locally with production-style settings

At repo root:

```powershell
npm install
npm --prefix CoursePlannerr install
npm run build
node server.cjs
```

Then verify:

- [http://localhost:3001/api/health](http://localhost:3001/api/health)
- [http://localhost:3001/api/ready](http://localhost:3001/api/ready)

The `ready` endpoint should report:

- `ok: true`
- `clientBuildPresent: true`
- your configured allowed origins

## 6. Deploy the same-origin production shape

The preferred production shape for this repo is:

- one public domain
- one Node server
- same origin for frontend and backend

That means:

- website pages from `/`
- API from `/api/*`

In this shape, you usually do **not** need `VITE_API_URL`.
The frontend will talk to the same origin automatically.

## 7. Verify canonical-origin behavior

If `ENFORCE_CANONICAL_ORIGIN=true`, requests to the wrong host should redirect to the canonical public URL.

Check:

- `http://old-host/...` redirects to `https://your-domain/...`
- direct requests to the canonical host stay there

## 8. Verify auth flows on the real domain

Test end-to-end:

- sign up
- email confirmation
- sign in
- forgot password
- password reset
- log out

The important part is that the email links come back to the real public domain, not localhost.

## 9. Verify app feature parity after domain cutover

Check these on the real domain:

- course search
- planner add/remove/save
- AI advisor
- reviews
- empty classes
- updates panel
- previouses uploads
- admin portal

## 10. Watch for these common failures

If sign-up or password reset lands on localhost:

- `PUBLIC_SITE_URL` or `VITE_PUBLIC_SITE_URL` is wrong
- Supabase `Site URL` or redirect URLs are still wrong

If the API is blocked in browser:

- `ALLOWED_ORIGINS` is missing the public domain

If the site works on one host but not `www` or the bare domain:

- DNS is incomplete
- canonical origin is not aligned with the actual chosen host

If the site works locally but not in production:

- env vars were not applied on the host
- the built frontend is stale
- the reverse proxy is not passing the correct host/proto headers

## 11. Recommended launch sequence

1. Set production env vars
2. Update Supabase auth URLs
3. Build the frontend
4. Start the backend
5. Verify `/api/health`
6. Verify `/api/ready`
7. Point DNS
8. Test auth flows
9. Test main student flows
10. Test admin flows

## 12. Post-cutover follow-up

After the domain is live:

- switch `ENABLE_HSTS=true` if HTTPS is stable
- keep `ENFORCE_CANONICAL_ORIGIN=true`
- remove unused localhost origins from production envs
- monitor catalog refresh and LIU portal sync on the live host
