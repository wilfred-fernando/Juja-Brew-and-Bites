import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host") || "";

  const cleanHost = host.split(":")[0].toLowerCase();

  /* ✅ ALLOW SYSTEM FILES */
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  /* ✅ LOGIN PAGE ALWAYS ALLOWED */
  if (
    pathname === "/login" ||
    pathname.startsWith("/admin/login")
  ) {
    return NextResponse.next();
  }

  /* ✅ SUBDOMAIN ROUTING */
  const routes: Record<string, string> = {
    "admin.": "/admin",
    "pos.": "/pos",
    "customer.": "/customer",
    "kitchen.": "/kitchen",
  };

  const matchedSubdomain = Object.keys(routes).find((key) =>
    cleanHost.startsWith(key)
  );

  const basePath = matchedSubdomain ? routes[matchedSubdomain] : null;

  if (basePath && !pathname.startsWith(basePath)) {
    const url = req.nextUrl.clone();
    url.pathname = `${basePath}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};