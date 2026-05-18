/**
 * QRCode — genera QR en el cliente usando qrcodejs (qrcode.min.js cargado en index.html).
 * No depende del backend. Produce QR perfectamente escaneables.
 */

import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    QRCode: new (
      el: HTMLElement,
      options: { text: string; width: number; height: number; colorDark: string; colorLight: string; correctLevel: number }
    ) => { makeCode: (text: string) => void; clear: () => void }
  }
}

interface Props {
  value: string
  size?: number
  className?: string
}

export default function QRCode({ value, size = 220, className = '' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<{ makeCode: (text: string) => void; clear: () => void } | null>(null)

  useEffect(() => {
    if (!containerRef.current || !window.QRCode) return

    // Limpia el contenedor antes de renderizar
    containerRef.current.innerHTML = ''

    instanceRef.current = new window.QRCode(containerRef.current, {
      text: value,
      width: size,
      height: size,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: 1, // QRCode.CorrectLevel.M
    })
  }, [value, size])

  return (
    <div
      ref={containerRef}
      className={`rounded-xl overflow-hidden ${className}`}
      style={{ width: size, height: size, display: 'inline-block' }}
    />
  )
}
