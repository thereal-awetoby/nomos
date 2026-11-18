import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

let initialTheme: 'dark' | 'light' = 'dark'
try {
  if (window.localStorage.getItem('nomos-theme') === 'light') initialTheme = 'light'
} catch { /* storage may be disabled */ }
document.documentElement.dataset.theme = initialTheme

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
