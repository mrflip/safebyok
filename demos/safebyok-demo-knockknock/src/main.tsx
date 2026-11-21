import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './components/App'
import './styles.css'

const rootElement = document.querySelector('#root')
if (rootElement === null) { throw new Error('The page lost its #root element') }
createRoot(rootElement).render(<StrictMode><App /></StrictMode>)
