import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// Refreshes the Supabase session cookie on every request and bounces signed-out
// visitors to /login. This is navigation only; RLS enforces data access.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
        },
      },
    },
  )

  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims)
  const path = request.nextUrl.pathname
  const onLogin = path === "/login"
  // Account setup links arrive signed out; /setup-password explains expired links itself.
  const isPublic = onLogin || path === "/auth/confirm" || path === "/setup-password"

  if (!signedIn && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url))
  }
  if (signedIn && onLogin) {
    return NextResponse.redirect(new URL("/", request.url)) // role-based home
  }
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logos/).*)"],
}
