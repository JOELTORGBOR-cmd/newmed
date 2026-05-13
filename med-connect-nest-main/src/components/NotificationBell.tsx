import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

type Notification = {
  id: string; title: string; body: string | null; link: string | null;
  read_at: string | null; created_at: string;
};

export function NotificationBell() {
  const { user, roles } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data as Notification[]) ?? []);
  };

  useEffect(() => {
    if (!user || roles.length === 0) return;
    load();
    const ch = supabase
      .channel("notifications_bell")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, roles]);

  const markAllRead = async () => {
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
    load();
  };

  if (!user || roles.length === 0) return null;
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <Badge className="absolute -right-1 -top-1 h-5 min-w-5 px-1 bg-destructive text-destructive-foreground">
              {unread}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <button onClick={markAllRead} className="text-xs text-primary hover:underline">
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">No notifications.</div>
          ) : (
            items.map((n) => {
              const Inner = (
                <div className={`border-b p-3 hover:bg-muted/40 ${n.read_at ? "opacity-60" : ""}`}>
                  <div className="text-sm font-medium">{n.title}</div>
                  {n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {new Date(n.created_at).toLocaleString()}
                  </div>
                </div>
              );
              return n.link ? (
                <Link key={n.id} to={n.link}>{Inner}</Link>
              ) : (
                <div key={n.id}>{Inner}</div>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
