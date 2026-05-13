import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "patient" | "doctor" | "staff" | "admin" | "nurse" | "lab_technician"
  | "pharmacist" | "receptionist" | "accountant";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
  isStaff: boolean;
  isAdmin: boolean;
  isDoctor: boolean;
  isPatient: boolean;
  isNurse: boolean;
  isLabTech: boolean;
  isPharmacist: boolean;
  isReceptionist: boolean;
  isAccountant: boolean;
};

const Ctx = createContext<AuthCtx | undefined>(undefined);

const STAFF_ROLES: AppRole[] = ["staff", "admin", "doctor", "nurse", "lab_technician", "pharmacist", "receptionist", "accountant"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const enforceActive = async (uid: string): Promise<boolean> => {
    const { data } = await supabase.from("profiles").select("status").eq("id", uid).maybeSingle();
    if (data?.status === "dormant") {
      toast.error("This account has been deactivated. Contact an administrator.");
      await supabase.auth.signOut();
      setSession(null); setUser(null); setRoles([]);
      return false;
    }
    return true;
  };

  const loadRoles = async (uid: string) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    setRoles((data ?? []).map((r) => r.role as AppRole));
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setLoading(true);
        setTimeout(async () => {
          const ok = await enforceActive(s.user.id);
          if (ok) await loadRoles(s.user.id);
          setLoading(false);
        }, 0);
      } else {
        setRoles([]); setLoading(false);
      }
    });
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        const ok = await enforceActive(data.session.user.id);
        if (ok) await loadRoles(data.session.user.id);
      }
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthCtx = {
    user, session, roles, loading,
    signOut: async () => { await supabase.auth.signOut(); },
    refreshRoles: async () => { if (user) await loadRoles(user.id); },
    isStaff: roles.some((r) => STAFF_ROLES.includes(r)),
    isAdmin: roles.includes("admin"),
    isDoctor: roles.includes("doctor"),
    isPatient: roles.includes("patient"),
    isNurse: roles.includes("nurse"),
    isLabTech: roles.includes("lab_technician"),
    isPharmacist: roles.includes("pharmacist"),
    isReceptionist: roles.includes("receptionist"),
    isAccountant: roles.includes("accountant"),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
