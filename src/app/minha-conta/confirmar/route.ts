import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { customerAuth } from '@/lib/customer-auth'
import { completeCustomerRegistration } from '../cadastrar/actions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const returnToCheckout = cookies().get('serenity-auth-return')?.value === 'checkout'

  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type')

  const go = (path: string) => {
    const response = NextResponse.redirect(
      new URL(returnToCheckout && path.startsWith('/minha-conta/entrar?') ? `${path}&retorno=checkout` : path, url.origin)
    )

    response.cookies.set('serenity-auth-return', '', { path: '/minha-conta', maxAge: 0 })
    response.headers.set(
      'Cache-Control',
      'private, no-store, max-age=0'
    )

    response.headers.set(
      'Referrer-Policy',
      'no-referrer'
    )

    response.headers.set(
      'X-Robots-Tag',
      'noindex, nofollow'
    )

    return response
  }

  if (
    url.searchParams.has('error') ||
    (!tokenHash && !code) ||
    (code && code.length > 2048) ||
    (
      tokenHash &&
      (
        tokenHash.length > 2048 ||
        (type !== 'email' && type !== 'signup')
      )
    )
  ) {
    return go(
      '/minha-conta/entrar?aviso=confirmacao-invalida'
    )
  }

  try {
    const auth = customerAuth()

    const result = tokenHash
      ? await auth.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as 'email' | 'signup',
        })
      : await auth.auth.exchangeCodeForSession(
          code as string
        )

    if (
      result.error ||
      !result.data.user?.email_confirmed_at
    ) {
      return go(
        '/minha-conta/entrar?aviso=confirmacao-invalida'
      )
    }

    const completed =
      await completeCustomerRegistration()

    if (completed.error) {
      return go(
        '/minha-conta/entrar?aviso=cadastro-pendente'
      )
    }

    return go(returnToCheckout ? '/checkout' : '/minha-conta')
  } catch {
    return go(
      '/minha-conta/entrar?aviso=confirmacao-invalida'
    )
  }
}
