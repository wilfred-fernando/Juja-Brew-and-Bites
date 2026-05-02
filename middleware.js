import { NextResponse } from "next/server";

export function middleware(request) {
  const url = request.nextUrl.pathname;

  // Protect all routes inside the /admin folder
  if (url.startsWith("/admin")) {
    
    // Look for the exact cookie set by our login page
    const isAuth = request.cookies.get("juja-admin-auth"); 

    if (!isAuth) {
      // Kick them back to the login page if the cookie is missing
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};