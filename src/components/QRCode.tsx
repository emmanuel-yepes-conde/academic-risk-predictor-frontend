/**
 * QRCode — genera QR via endpoint del backend (Python qrcode library).
 * Produce PNGs perfectamente escaneables.
 */

import { API_V1 } from '../config/env'

interface Props {
  value: string
  size?: number
  className?: string
}

export default function QRCode({ value, size = 220, className = '' }: Props) {
  const src = `${API_V1}/attendance/qr?data=${encodeURIComponent(value)}&size=${size}`

  return (
    <img
      src={src}
      alt="QR Code"
      width={size}
      height={size}
      className={`rounded-xl ${className}`}
      style={{ display: 'block', imageRendering: 'crisp-edges' }}
    />
  )
}
