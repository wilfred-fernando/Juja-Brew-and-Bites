"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";

/* ----------------------------- TYPES ----------------------------- */

export type Role =
  | "cashier"
  | "cashier_disabled"
  | "kds"
  | "admin"
  | "super_admin";

type UsePortalAuthProps = {
  allowedRoles: Role[];
  requireStore?: boolean;
  portal?: string;
  loginPath?: string;
};

type UsePortalAuthReturn = {
  loading: boolean;
  authorized: boolean;
  userEmail: string | null;
  userRole: Role | null;
  userStoreId: string | null;
};

/* ----------------------------- HOOK ----------------------------- */

export function usePortalAuth({
  allowedRoles,
  requireStore = true,
  portal,
}: UsePortalAuthProps): UsePortalAuthReturn {
  const supabase = getSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [userRole, setUserRole] = useState<Role | null>(null);
  const [userStoreId, setUserStoreId] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      try {
        // ✅ Get session
        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError) {
          console.error("Session error:", sessionError);
          setAuthorized(false);
          return;
        }

        const user = sessionData?.session?.user;

        if (!user) {
          setAuthorized(false);
          return;
        }

        setUserEmail(user.email ?? null);

        // ✅ Get profile (role + store)
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role, store_id")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError) {
          console.error("Profile error:", profileError);
          setAuthorized(false);
          return;
        }

        const role = (profile?.role ?? null) as Role | null;
        const storeId = profile?.store_id ?? null;

        setUserRole(role);
        setUserStoreId(storeId);

        // ✅ Check role permission
        if (!role || !allowedRoles.includes(role)) {
          setAuthorized(false);
          return;
        }

        // ✅ ✅ IMPORTANT: Super Admin bypass store requirement
        if (requireStore && role !== "super_admin" && !storeId) {
          console.warn("Non-super-admin has no store assigned");
          setAuthorized(false);
          return;
        }
        // ✅ Authorized
        setAuthorized(true);
      } catch (err) {
        console.error("Auth error:", err);
        setAuthorized(false);
      } finally {
        setLoading(false);
      }
    }

    run();
  }, [allowedRoles, requireStore, supabase, portal]);

  /* ----------------------------- RETURN ----------------------------- */

  return {
    loading,
    authorized,
    userEmail,
    userRole,
    userStoreId,
  };
}
