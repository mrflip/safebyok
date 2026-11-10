import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

/** The boot line every Vite + React app has, for each of the demo's pages. */
export const mountPage = (page: ReactNode) => {
  const rootElement = document.querySelector('#root')
  if (rootElement === null) { throw new Error('the page lost its #root element') }
  createRoot(rootElement).render(<StrictMode>{page}</StrictMode>)
}
