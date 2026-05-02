import { NextResponse } from "next/server";

export function proxy(request) {
  const url = request.nextUrl.pathname;

  if (url.startsWith("/admin")) {
    const isAuth = request.cookies.get("juja-admin-auth"); 

    if (!isAuth) {
      // If no cookie, go to login
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"], // This specifically targets all admin sub-pages
};