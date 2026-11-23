import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './components/App'
import { readyStores } from './lib/session'
import './styles.css'

const rootElement = document.querySelector('#root')
if (rootElement === null) { throw new Error('The page lost its #root element') }
// The fixture is loaded, where asked for, before the app makes its device.
await readyStores()
createRoot(rootElement).render(<StrictMode><App /></StrictMode>)
