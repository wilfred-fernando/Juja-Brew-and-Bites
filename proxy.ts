import { NextRequest, NextResponse } from "next/server";

// ─── MUST EXPORT AS 'proxy' TO MATCH NEXT.JS 16 STANDARDS ───
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host") || "";

  // 1. IGNORE SYSTEM FILES AND STATIC ASSETS
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // 2. SUBDOMAIN ROUTING MAP
  const routes: Record<string, string> = {
    "admin.": "/admin",
    "pos.": "/pos",
    "customer.": "/customer",
    "kitchen.": "/kitchen",
  };

  // Strip out the port number to ensure local testing works seamlessly
  const cleanHost = host.split(":")[0].toLowerCase();
  
  const matchedSubdomain = Object.keys(routes).find((key) =>
    cleanHost.startsWith(key)
  );

  const targetPath = matchedSubdomain ? routes[matchedSubdomain] : null;

  // 3. APPLY SILENT REWRITE
  if (targetPath) {
    // If the path doesn't already contain the hidden folder route, inject it
    if (!pathname.startsWith(targetPath)) {
      const url = req.nextUrl.clone();
      const fullPath = pathname === "/" ? "" : pathname;
      
      url.pathname = `${targetPath}${fullPath}`;
      return NextResponse.rewrite(url);
    }
  }

  // 4. DEFAULT FALLBACK
  return NextResponse.next();
}

// ─── MATCHER CONFIGURATION ───
export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};