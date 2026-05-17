import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host") || "";

  const cleanHost = host.split(":")[0].toLowerCase();

  // ✅ ignore system paths
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // ✅ allow login
  if (pathname.startsWith("/admin/login") || pathname === "/login") {
    return NextResponse.next();
  }

  const routes: Record<string, string> = {
    "admin.": "/admin",
    "pos.": "/pos",
    "customer.": "/customer",
  };

  const sub = Object.keys(routes).find((k) =>
    cleanHost.startsWith(k)
  );

  const base = sub ? routes[sub] : null;

  if (base && !pathname.startsWith(base)) {
    const url = req.nextUrl.clone();
    url.pathname = `${base}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};