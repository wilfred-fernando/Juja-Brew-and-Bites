import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function usePortalAuth({ allowedRoles }) {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [userEmail, setUserEmail] = useState(null);

  useEffect(() => {
    async function run() {
      try {
        const { data } = await supabase.auth.getSession();

        const user = data?.session?.user;

        if (!user) {
          setAuthorized(false);
          return;
        }

        setUserEmail(user.email);

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (allowedRoles.includes(profile?.role)) {
          setAuthorized(true);
        } else {
          setAuthorized(false);
        }
      } catch (err) {
        setAuthorized(false);
      } finally {
        setLoading(false); // ✅ CRITICAL
      }
    }

    run();
  }, []);

  return { loading, authorized, userEmail };
}