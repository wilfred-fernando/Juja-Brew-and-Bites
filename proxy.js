import { NextResponse } from "next/server";

export function proxy(request) {
  const { pathname } = request.nextUrl;

  // If the user is trying to access /admin
  if (pathname.startsWith("/admin")) {
    const authCookie = request.cookies.get("juja-admin-auth");

    // If cookie is missing, send them to login
    if (!authCookie) {
      console.log("No auth cookie found, redirecting to login");
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Broaden the matcher to catch all admin sub-routes
  matcher: ["/admin", "/admin/:path*"],
};