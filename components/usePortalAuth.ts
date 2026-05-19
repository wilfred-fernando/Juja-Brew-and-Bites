"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type PortalAuthOptions = {
  portal: "admin" | "pos" | "customer";
  loginPath: string;                  // "/admin/login", "/pos/login", "/customer/login"
  allowedRoles: string[];             // e.g. ["admin","super_admin"] for admin
};

export function usePortalAuth({ portal, loginPath, allowedRoles }: PortalAuthOptions) {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      setLoading(true);

      const { data } = await supabase.auth.getSession();
      const session = data?.session;

      if (!session) {
        if (mounted) {
          setAuthorized(false);
          setLoading(false);
          if (!pathname.startsWith(loginPath)) router.push(loginPath);
        }
        return;
      }

      // fetch role safely (same pattern you used in login with maybeSingle) [1](https://onedrive.live.com/?id=5b457a91-1d22-49e6-a9a9-5d3d8e715d86&cid=933e55cc8541ec41&web=1)
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();

      const role = profile?.role || "customer";

      if (!mounted) return;

      setUserEmail(session.user.email || "");
      const ok = allowedRoles.includes(role);
      setAuthorized(ok);
      setLoading(false);

      // if logged in but wrong role for portal → send to its correct home
      if (!ok) {
        if (role === "admin" || role === "super_admin") router.push("/admin");
        else if (role === "pos") router.push("/pos");
        else router.push("/customer");
      }
    };

    run();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        router.push(loginPath);
      }
    });

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, [router, pathname, loginPath, allowedRoles, portal]);

  return { loading, authorized, userEmail };
}
