import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
  const pathname = request.nextUrl.pathname

  const isAdmin =
    pathname === '/admin' ||
    pathname.startsWith('/admin/')

  const name = isAdmin
    ? 'serenity-admin'
    : 'serenity-customer'

  const path = isAdmin ? '/admin' : '/'

  const hasSession = !pathname.startsWith('/acompanhar') && request.cookies.getAll().some(item =>
    item.name === name ||
    item.name.startsWith(name + '.')
  )

  if (url && key && hasSession) {
    const auth = createServerClient(url, key, {
      cookieOptions: {
        name,
        path,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      },

      cookies: {
        getAll: () => request.cookies.getAll(),

        setAll: items => {
          items.forEach(({ name: cookieName, value }) => {
            request.cookies.set(cookieName, value)
          })

          const previousCookies = response.cookies.getAll()

          response = NextResponse.next({ request })

          previousCookies.forEach(cookie => {
            response.cookies.set(cookie)
          })

          items.forEach(
            ({ name: cookieName, value, options }) => {
              response.cookies.set(
                cookieName,
                value,
                options
              )
            }
          )
        },
      },
    })

    await auth.auth.getUser()
  }

  response.headers.set(
    'Cache-Control',
    'private, no-store, max-age=0'
  )

  if (pathname.startsWith('/acompanhar')) response.headers.set('Referrer-Policy','no-referrer')

  response.headers.set(
    'X-Robots-Tag',
    'noindex, nofollow'
  )

  return response
}

export const config = {
  matcher: [
    '/acompanhar/:path*',
    '/admin/:path*',
    '/minha-conta/:path*',
    '/checkout/:path*',
  ],
}
