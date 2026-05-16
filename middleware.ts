import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host") || "";

  // ✅ 0. PUBLIC ROUTES (DO NOT REWRITE)
  if (
    pathname === "/" ||
    pathname.startsWith("/menu") ||
    pathname.startsWith("/promo")
  ) {
    return NextResponse.next();
  }

  // ✅ 1. IGNORE SYSTEM FILES
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // ✅ 2. SUBDOMAIN ROUTING
  const routes: Record<string, string> = {
    "admin.": "/admin",
    "pos.": "/pos",
    "customer.": "/customer",
    "kitchen.": "/kitchen",
  };

  const cleanHost = host.split(":")[0].toLowerCase();

  const matchedSubdomain = Object.keys(routes).find((key) =>
    cleanHost.startsWith(key)
  );

  const targetPath = matchedSubdomain ? routes[matchedSubdomain] : null;

  // ✅ 3. APPLY REWRITE (ONLY FOR NON-PUBLIC ROUTES)
  if (targetPath) {
    if (!pathname.startsWith(targetPath)) {
      const url = req.nextUrl.clone();
      const fullPath = pathname === "/" ? "" : pathname;

      url.pathname = `${targetPath}${fullPath}`;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};