/**
 * QRCode — genera un QR code SVG completamente en cliente.
 * Sin llamadas a red, sin dependencias externas.
 * Usa el generador puro TypeScript en src/lib/qrcode.ts
 */

import { useMemo } from 'react'
import { generateQRDataUri } from '../lib/qrcode'

interface Props {
  value: string
  size?: number
  className?: string
}

export default function QRCode({ value, size = 220, className = '' }: Props) {
  // Genera el SVG en memoria — sincrónico, sin red
  const dataUri = useMemo(() => generateQRDataUri(value, size), [value, size])

  return (
    <img
      src={dataUri}
      alt="QR Code"
      width={size}
      height={size}
      className={`rounded-xl ${className}`}
      style={{ imageRendering: 'crisp-edges', display: 'block' }}
    />
  )
}
