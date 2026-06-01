import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { APP_BASE_PATH } from './config/runtime.ts'
import { reconcileClientBuild } from './utils/plannerPreferences.ts'

declare const __TERMER_BUILD_ID__: string;

reconcileClientBuild(__TERMER_BUILD_ID__);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter basename={APP_BASE_PATH === "/" ? undefined : APP_BASE_PATH}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
