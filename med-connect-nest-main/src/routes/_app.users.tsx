import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/users")({
  component: UsersPage,
});

function UsersPage() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data: profs } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      const merged = (profs ?? []).map((p) => ({ ...p, roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role) }));
      setUsers(merged);
    })();
  }, [isAdmin]);

  if (!isAdmin) return <div className="text-sm text-muted-foreground">Admin access only.</div>;

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Users</h1><p className="text-sm text-muted-foreground">All accounts and their roles.</p></div>
      <Card className="divide-y">
        {users.map((u) => (
          <div key={u.id} className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-semibold">{u.full_name || "—"}</div>
              <div className="text-xs text-muted-foreground">{u.student_id ? `ID: ${u.student_id} • ` : ""}{u.phone ?? ""}</div>
            </div>
            <div className="flex flex-wrap gap-1">
              {u.roles.length === 0 && <Badge variant="outline">no role</Badge>}
              {u.roles.map((r: string) => <Badge key={r} className="bg-secondary text-secondary-foreground">{r}</Badge>)}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
