import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export function usePresence() {
  const { user, isStaff } = useAuth();
  useEffect(() => {
    if (!user || !isStaff) return;
    let cancelled = false;
    const beat = async (status: "online" | "offline") => {
      if (cancelled) return;
      await supabase.from("staff_presence").upsert({
        user_id: user.id,
        status,
        last_seen: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    };
    beat("online");
    const iv = setInterval(() => beat("online"), 30000);
    const onHide = () => beat(document.visibilityState === "hidden" ? "offline" : "online");
    const onUnload = () => beat("offline");
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      cancelled = true;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
      beat("offline");
    };
  }, [user, isStaff]);
}
