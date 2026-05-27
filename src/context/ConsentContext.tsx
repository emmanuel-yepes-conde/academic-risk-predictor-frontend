import { createContext, useContext } from 'react'

interface ConsentContextValue {
  /** true mientras el modal de consentimiento esté abierto / pendiente */
  consentPending: boolean
}

export const ConsentContext = createContext<ConsentContextValue>({ consentPending: false })

export function useConsent() {
  return useContext(ConsentContext)
}
