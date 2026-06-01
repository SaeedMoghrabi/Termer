# Windows Auto-Start

For local always-on use on this laptop, the production setup is one hidden backend process:

- `server.cjs` serves the built frontend from `CoursePlannerr/dist`
- you do not need a separate Vite frontend in production

## Install auto-start

Run once:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\install-termer-autostart.ps1
```

This creates a Windows Startup shortcut named `Termer Auto Start.lnk` that launches the backend in the background whenever you log into Windows.

## Start now

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\start-termer-hidden.ps1
```

Open:

- `http://localhost:3001`

## Stop it

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\stop-termer.ps1
```

## Remove auto-start

```powershell
powershell -ExecutionPolicy Bypass -File scripts\windows\remove-termer-autostart.ps1
```

## Important

This only makes it always start on this Windows laptop. If the laptop sleeps, shuts down, loses power, or loses internet, the site goes offline.

For a real public website with a domain and 24/7 uptime, deploy the backend to a server or cloud host and point the domain there.
