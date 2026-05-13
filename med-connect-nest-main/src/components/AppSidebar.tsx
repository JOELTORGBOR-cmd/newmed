import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, CalendarCheck, Stethoscope, FileText, FlaskConical, Wallet, Pill,
  Users, UserPlus, LogOut, ClipboardList, HeartPulse, Activity, ConciergeBell,
  Calculator, BarChart3, Bell, MessageCircle, Sparkles,
} from "lucide-react";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (s) => s.location.pathname });
  const {
    user, isAdmin, isDoctor, isNurse, isLabTech, isPharmacist, isReceptionist,
    isAccountant, isPatient, signOut,
  } = useAuth();
  const [unreadLabs, setUnreadLabs] = useState(0);

  // Patient: count unseen lab results for "New Result" badge
  useEffect(() => {
    if (!user || !isPatient) { setUnreadLabs(0); return; }
    const fetchCount = async () => {
      const { count } = await supabase
        .from("lab_results")
        .select("id", { count: "exact", head: true })
        .eq("patient_id", user.id)
        .is("viewed_at", null);
      setUnreadLabs(count ?? 0);
    };
    fetchCount();
    const ch = supabase
      .channel("lab_results_badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "lab_results" }, fetchCount)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, isPatient, path]);

  const isActive = (u: string) => path === u;

  type Item = { title: string; url: string; icon: React.ComponentType<{ className?: string }>; badge?: number };

  // Patient default sidebar
  const patientItems: Item[] = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "Appointments", url: "/appointments", icon: CalendarCheck },
    { title: "Doctors", url: "/doctors", icon: Stethoscope },
    { title: "Records", url: "/records", icon: FileText, badge: unreadLabs },
    { title: "Lab Results", url: "/lab-results", icon: FlaskConical, badge: unreadLabs },
    { title: "Billing", url: "/billing", icon: Wallet },
  ];

  const pharmacistItems: Item[] = [
    { title: "Dispense Queue", url: "/pharmacy", icon: ClipboardList },
    { title: "Inventory", url: "/inventory", icon: Pill },
  ];
  const nurseItems: Item[] = [
    { title: "Patient Queue", url: "/queue", icon: HeartPulse },
  ];
  const labItems: Item[] = [
    { title: "Lab Requests", url: "/lab-requests", icon: Activity },
    { title: "Test Results", url: "/lab-results", icon: FlaskConical },
  ];
  const doctorItems: Item[] = [
    { title: "All Records", url: "/admin-records", icon: ClipboardList },
    { title: "Appointments", url: "/appointments", icon: CalendarCheck },
  ];
  const receptionistItems: Item[] = [
    { title: "Front Desk", url: "/front-desk", icon: ConciergeBell },
    { title: "Appointments", url: "/appointments", icon: CalendarCheck },
    { title: "Doctors", url: "/doctors", icon: Stethoscope },
    { title: "Reminders", url: "/reminders", icon: Bell },
    { title: "Billing Center", url: "/billing-center", icon: Calculator },
  ];
  const accountantItems: Item[] = [
    { title: "Billing Center", url: "/billing-center", icon: Calculator },
    { title: "Hospital Insights", url: "/insights", icon: BarChart3 },
  ];
  const adminItems: Item[] = [
    { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    { title: "Patients", url: "/patients", icon: Users },
    { title: "All Records", url: "/admin-records", icon: ClipboardList },
    { title: "All Invoices", url: "/admin-billing", icon: Wallet },
    { title: "Billing Center", url: "/billing-center", icon: Calculator },
    { title: "Reminders", url: "/reminders", icon: Bell },
    { title: "Hospital Insights", url: "/insights", icon: BarChart3 },
    { title: "Users", url: "/users", icon: Users },
    { title: "Staff Management", url: "/staff-management", icon: UserPlus },
    { title: "Inventory", url: "/inventory", icon: Pill },
  ];
  const communicationItems: Item[] = [
    { title: "Chat Only Me", url: "/chat", icon: MessageCircle },
    { title: "Found Family", url: "/found-family", icon: Sparkles },
  ];

  const renderGroup = (label: string, items: Item[]) => (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((it) => (
            <SidebarMenuItem key={it.url + label}>
              <SidebarMenuButton asChild isActive={isActive(it.url)}>
                <Link to={it.url} className="flex items-center gap-2">
                  <it.icon className="h-4 w-4" />
                  {!collapsed && (
                    <span className="flex-1 flex items-center justify-between gap-2">
                      <span>{it.title}</span>
                      {it.badge ? (
                        <Badge className="h-5 min-w-5 px-1.5 bg-destructive text-destructive-foreground">{it.badge}</Badge>
                      ) : null}
                    </span>
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-4">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
            <Stethoscope className="h-4 w-4" />
          </div>
          {!collapsed && <span className="text-base font-bold">MediCare</span>}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {isAdmin && renderGroup("Admin", adminItems)}
        {!isAdmin && isDoctor && renderGroup("Doctor", doctorItems)}
        {!isAdmin && isNurse && renderGroup("Nurse", nurseItems)}
        {!isAdmin && isLabTech && renderGroup("Laboratory", labItems)}
        {!isAdmin && isPharmacist && renderGroup("Pharmacy", pharmacistItems)}
        {!isAdmin && isReceptionist && renderGroup("Reception", receptionistItems)}
        {!isAdmin && isAccountant && renderGroup("Finance", accountantItems)}
        {isPatient && !isAdmin && renderGroup("Patient", patientItems)}
        {!isPatient && renderGroup("Communication", communicationItems)}

        <div className="mt-auto p-3">
          <Button variant="ghost" size="sm" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => signOut()}>
            <LogOut className="mr-2 h-4 w-4" />
            {!collapsed && "Sign out"}
          </Button>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}
