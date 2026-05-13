import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { useAuth } from "@/lib/auth";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    console.debug("[guard:_app] beforeLoad", { path: location.pathname, hasSession: !!data.session, uid: data.session?.user?.id });
    if (!data.session) {
      console.debug("[guard:_app] no session -> /login");
      throw redirect({ to: "/login" });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-muted">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header className="flex h-14 items-center gap-3 border-b bg-white px-4">
            <SidebarTrigger />
            <div className="text-sm font-medium text-muted-foreground">MediCare Health Portal</div>
            <div className="ml-auto"><NotificationBell /></div>
          </header>
          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
