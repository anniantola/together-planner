import React from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'
import 'leaflet/dist/leaflet.css'
const updateSW = registerSW({ onNeedRefresh() { if (window.confirm('An update is available. Reload now? Unsaved edits will be lost.')) void updateSW(true) } })
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
