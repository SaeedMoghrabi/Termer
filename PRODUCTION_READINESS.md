# Production Readiness Notes

This app can be launched for real users, but the provider limits need to be treated deliberately.

## Domain Checklist

Before pointing a real domain at the app, make sure all of these are set:

- Build command at repo root: `npm run build`
- Start command at repo root: `npm start`
- Server port: set `PORT` from the host platform
- Public site URL: set `PUBLIC_SITE_URL` and `VITE_PUBLIC_SITE_URL` to your final HTTPS domain
- Allowed browser origins: set `ALLOWED_ORIGINS` to your real frontend origin(s)
- Proxy awareness: set `TRUST_PROXY=true` when the app sits behind a real proxy or platform load balancer
- Canonical host redirect: set `ENFORCE_CANONICAL_ORIGIN=true` once you know the final domain
- HSTS: set `ENABLE_HSTS=true` only when the domain is stable over HTTPS
- Frontend base path: keep `VITE_APP_BASE_PATH=/` unless you deploy under a subpath like `/planner`

Supabase settings that must match the domain:

- Authentication URL / Site URL: set it to the final HTTPS domain
- Redirect URLs: include
  - `https://your-domain.com/login?confirmed=true`
  - `https://your-domain.com/update-password`
- If you deploy under a subpath, include that exact path in the redirect URLs too

What the codebase now supports:

- The backend serves the built frontend directly from `CoursePlannerr/dist`, so one domain can serve both the website and `/api/*`
- The frontend router can run from a custom base path through `VITE_APP_BASE_PATH`
- The backend now restricts cross-origin browser access through the configured `ALLOWED_ORIGINS` list instead of fully open CORS
- The backend can redirect mismatched hosts to the canonical `PUBLIC_SITE_URL` when `ENFORCE_CANONICAL_ORIGIN=true`
- Auth confirmation and reset emails now use env-driven public URLs instead of hardcoded localhost assumptions
- The frontend Supabase client now reads deploy env vars
- Health endpoints are available at `/api/health` and `/api/ready`
- Security headers and proxy-aware HTTPS handling are enabled in the Node server

## Domain Cutover File

Use this dedicated checklist during the actual switch:

- [C:\Users\Saeed\Desktop\Myver\CoursePlannerr\CMPS-271\DOMAIN_CUTOVER_CHECKLIST.md](C:\Users\Saeed\Desktop\Myver\CoursePlannerr\CMPS-271\DOMAIN_CUTOVER_CHECKLIST.md)

## Supabase

- Supabase is not the main blocker for 10k users. Official billing quotas currently list 50,000 monthly active users on Free and 100,000 included monthly active users on Pro/Team before overage.
- Keep reviews, saved schedules, accounts, and syllabus metadata in Supabase with Row Level Security enabled.
- Add database indexes for user-owned reads before launch: saved schedules by `user_id`, reviews by course/professor key, and syllabi by `user_id`/course.
- If the site grows beyond one app server or gets heavy write traffic, use Supabase connection pooling/Supavisor and monitor connection usage.

## Groq

- Groq limits are the likely bottleneck. Limits apply at the organization level and are measured by requests/tokens per minute/day.
- The backend now protects the site with:
  - AI response caching (`AI_CACHE_TTL_MS`)
  - per-user/IP AI throttling (`AI_RATE_LIMIT_WINDOW_MS`, `AI_RATE_LIMIT_MAX`)
  - optional daily remote-AI budget (`AI_REMOTE_DAILY_LIMIT`)
  - deterministic local advisor fallback when Groq is missing, rate-limited, or fails
- For production, use a paid Groq plan or enterprise limits if you expect thousands of AI questions per day.

## Catalog Availability

- The server always serves the last built catalog snapshots from disk first.
- Background refreshes can update snapshots without making users wait:
- `CATALOG_AUTO_REFRESH=true`
- `CATALOG_AUTO_REFRESH_ON_START=true`
- `CATALOG_REFRESH_INTERVAL_MINUTES=2`
- `VITE_CATALOG_STATUS_POLL_INTERVAL_MS=45000`
- Public catalog responses are cached in memory and with HTTP cache headers so repeated searches do not recompute the same payload.
- The frontend now polls a lightweight catalog-status endpoint, so Home, Empty Classes, and Reviews can react quickly when a new term or changed sections land on the backend.

## Scaling Beyond One Server

- The current in-memory caches are perfect for one Node server and local demos.
- For multiple Node instances, move catalog/AI cache and rate-limit counters to Redis/Upstash so all instances share the same state.
- Put a CDN in front of the built frontend and public catalog GET endpoints.
- Keep secrets server-side only: `SUPABASE_ANON_KEY` is okay for the browser, but `GROQ_API_KEY` and any service-role Supabase key must never go to frontend code.
