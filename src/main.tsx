import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { GradesProvider } from './context/GradesContext'
import { ToastProvider } from './components/Toast'
import App from './App'
import './index.css'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// ─── Register Service Worker (Push Notifications) ───────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('[SW] Registration failed:', err)
    })
  })
}

// ─── Register GSAP plugins ───────────────────────────────────────────────────
gsap.registerPlugin(ScrollTrigger)

// ─── Lenis smooth scroll ─────────────────────────────────────────────────────
const lenis = new Lenis({
  duration:    1.2,
  easing:      (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: true,
})

// Sync Lenis scroll positions → GSAP ScrollTrigger
lenis.on('scroll', ScrollTrigger.update)

// Drive Lenis via GSAP ticker for perfect frame sync
gsap.ticker.add((time) => { lenis.raf(time * 1000) })
gsap.ticker.lagSmoothing(0)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <GradesProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </GradesProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
