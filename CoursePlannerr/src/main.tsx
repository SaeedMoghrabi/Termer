import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { API_DIAGNOSTICS, APP_BASE_PATH } from './config/runtime.ts'
import { clearTermerClientState, reconcileClientBuild } from './utils/plannerPreferences.ts'

declare const __TERMER_BUILD_ID__: string;

function renderFatalStartup(error: unknown) {
  const rootElement = document.getElementById('root');
  if (!rootElement) return;

  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : 'Unknown startup error';

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <div className="plannerCrashFallback" role="alert" aria-live="assertive">
        <img
          className="plannerCrashFallback__logo"
          src="/branding/termer-mark.png"
          alt="Termer"
        />
        <div className="plannerCrashFallback__eyebrow">Startup blocked</div>
        <strong>Termer could not finish booting the app.</strong>
        <span>
          The page stayed alive so you can recover instead of seeing a blank screen.
        </span>
        <span className="plannerCrashFallback__detail">Issue: {message}</span>
        <div className="plannerCrashFallback__actions">
          <button
            type="button"
            onClick={() => {
              clearTermerClientState();
              window.location.reload();
            }}
          >
            Clear local app state
          </button>
          <button type="button" onClick={() => window.location.reload()}>
            Retry loading courses
          </button>
        </div>
      </div>
    </React.StrictMode>
  );
}

window.addEventListener('error', (event) => {
  if (!document.getElementById('root')?.childElementCount) {
    renderFatalStartup(event.error ?? event.message);
  }
});

window.addEventListener('unhandledrejection', (event) => {
  if (!document.getElementById('root')?.childElementCount) {
    renderFatalStartup(event.reason);
  }
});

console.info('[Termer boot]', {
  buildId: __TERMER_BUILD_ID__,
  viteApiUrl: API_DIAGNOSTICS.viteApiUrl || '(not set)',
  resolvedApiRoot: API_DIAGNOSTICS.resolvedApiRoot || '(same origin)',
  windowOrigin: API_DIAGNOSTICS.origin || '(server render)',
});

if (API_DIAGNOSTICS.configurationWarning) {
  console.warn('[Termer runtime warning]', API_DIAGNOSTICS.configurationWarning);
}

try {
  reconcileClientBuild(__TERMER_BUILD_ID__);

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <BrowserRouter basename={APP_BASE_PATH === "/" ? undefined : APP_BASE_PATH}>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
} catch (error) {
  renderFatalStartup(error);
}
