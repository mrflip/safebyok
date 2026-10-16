import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

// The boot line every Vite + React app has.
const rootElement = document.querySelector('#root')
if (rootElement === null) { throw new Error('index.html lost its #root element') }
createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
