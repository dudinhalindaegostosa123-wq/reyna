import LoginClient from './LoginClient'
import { guestCheckoutEnabled } from '@/lib/guest-checkout'

export const dynamic = 'force-dynamic'

export default function CustomerLoginPage({ searchParams = {} }: {
  searchParams?: { aviso?: string | string[]; retorno?: string | string[] }
}) {
  return <LoginClient searchParams={searchParams} guestEnabled={guestCheckoutEnabled()} />
}
