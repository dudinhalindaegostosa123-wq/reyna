import { NextResponse } from 'next/server'
import { customerAuth } from '@/lib/customer-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const token = url.searchParams.get('token_hash')
  const fail = () => {
    const response = NextResponse.redirect(new URL('/minha-conta/recuperar?erro=link', url.origin))
    response.headers.set('Cache-Control', 'private, no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    response.headers.set('X-Robots-Tag', 'noindex, nofollow')
    return response
  }
  let response: NextResponse
  try {
    if (url.searchParams.has('error') || (!code && !token) || (code && code.length > 2048) ||
      (token && (token.length > 2048 || url.searchParams.get('type') !== 'recovery'))) return fail()
    const auth = customerAuth()
    const result = token ? await auth.auth.verifyOtp({ token_hash: token, type: 'recovery' }) : await auth.auth.exchangeCodeForSession(code!)
    if (result.error || !result.data.user || !result.data.session) return fail()
    response = NextResponse.redirect(new URL('/minha-conta/nova-senha', url.origin))
    response.cookies.set('serenity-password-recovery', result.data.user.id, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/minha-conta', maxAge: 900 })
  } catch { response = fail() }
  response.headers.set('Cache-Control', 'private, no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return response
}
