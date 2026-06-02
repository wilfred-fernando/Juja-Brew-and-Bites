import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host") || "";

  const cleanHost = host.split(":")[0].toLowerCase();

  // ✅ SYSTEM FILES
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // ✅ ALLOW LOGIN
  if (
    pathname.startsWith("/admin/login") ||
    pathname.startsWith("/finance/login") ||
    pathname.startsWith("/pos/login") ||
    pathname.startsWith("/customer/login")
  ) {
    return NextResponse.next();
  }

  const routes: Record<string, string> = {
    "admin.": "/admin",
    "finance.": "/finance",
    "pos.": "/pos",
    "customer.": "/customer",
  };

  const subdomain = Object.keys(routes).find((key) =>
    cleanHost.startsWith(key)
  );

  const basePath = subdomain ? routes[subdomain] : null;

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
