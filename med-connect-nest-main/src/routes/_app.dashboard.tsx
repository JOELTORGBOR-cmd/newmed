import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, FileText, FlaskConical, Wallet, Pill, Users, Stethoscope, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

type Tile = {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  to?: string;
  search?: Record<string, string>;
  alert?: boolean;
};

function Dashboard() {
  const { user, isStaff, isAdmin, isDoctor, isNurse, isLabTech, isPharmacist, isReceptionist, isAccountant, loading: authLoading } = useAuth();
  const [stats, setStats] = useState({ appts: 0, invoices: 0, labs: 0, drugsInStock: 0, lowStock: 0, patients: 0, staff: 0 });
  const [quick, setQuick] = useState({ todayAppts: 0, records: 0, newLabs: 0, openInvoices: 0 });

  const loadStaff = async () => {
    const STAFF_ROLES = ["doctor", "nurse", "pharmacist", "lab_technician", "receptionist", "accountant", "staff", "admin"] as const;
    const [a, i, l, ds, pr, sr] = await Promise.all([
      supabase.from("appointments").select("id", { count: "exact", head: true }).neq("status", "cancelled"),
      supabase.from("invoices").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("lab_results").select("id", { count: "exact", head: true }),
      supabase.from("drugs").select("id, stock, low_stock_threshold").limit(1000),
      supabase.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "patient"),
      supabase.from("user_roles").select("user_id", { count: "exact", head: true }).in("role", STAFF_ROLES),
    ]);
    const allDrugs = ds.data ?? [];
    const drugsInStock = allDrugs.filter((x) => (x.stock ?? 0) > 0).length;
    const lowStock = allDrugs.filter((x) => (x.stock ?? 0) <= (x.low_stock_threshold ?? 0)).length;
    setStats({ appts: a.count ?? 0, invoices: i.count ?? 0, labs: l.count ?? 0, drugsInStock, lowStock, patients: pr.count ?? 0, staff: sr.count ?? 0 });

    const start = new Date(); start.setHours(0,0,0,0);
    const end = new Date(); end.setHours(23,59,59,999);
    const [ta, mr, nl, oi] = await Promise.all([
      supabase.from("appointments").select("id", { count: "exact", head: true })
        .gte("scheduled_at", start.toISOString()).lte("scheduled_at", end.toISOString())
        .not("status", "in", "(cancelled,completed)"),
      supabase.from("medical_records").select("id", { count: "exact", head: true }),
      supabase.from("lab_results").select("id", { count: "exact", head: true }).is("viewed_at", null),
      supabase.from("invoices").select("id", { count: "exact", head: true }).in("status", ["pending","pending_verification"]),
    ]);
    setQuick({ todayAppts: ta.count ?? 0, records: mr.count ?? 0, newLabs: nl.count ?? 0, openInvoices: oi.count ?? 0 });
  };

  useEffect(() => {
    if (!user) return;
    if (isStaff) {
      loadStaff();
      const ch = supabase.channel("dash-live")
        .on("postgres_changes", { event: "*", schema: "public", table: "drugs" }, loadStaff)
        .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, loadStaff)
        .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, loadStaff)
        .on("postgres_changes", { event: "*", schema: "public", table: "lab_results" }, loadStaff)
        .subscribe();
      return () => { supabase.removeChannel(ch); };
    } else {
      (async () => {
        const [a, i, l] = await Promise.all([
          supabase.from("appointments").select("id", { count: "exact", head: true }).eq("patient_id", user.id),
          supabase.from("invoices").select("id", { count: "exact", head: true }).eq("patient_id", user.id).eq("status", "pending"),
          supabase.from("lab_results").select("id", { count: "exact", head: true }).eq("patient_id", user.id),
        ]);
        setStats((s) => ({ ...s, appts: a.count ?? 0, invoices: i.count ?? 0, labs: l.count ?? 0 }));
      })();
    }
  }, [user, isStaff]);

  if (!authLoading) {
    if (isDoctor && !isAdmin) return <Navigate to="/admin-records" />;
    if (isNurse && !isAdmin) return <Navigate to="/queue" />;
    if (isLabTech && !isAdmin) return <Navigate to="/lab-requests" />;
    if (isPharmacist && !isAdmin) return <Navigate to="/pharmacy" />;
    if (isReceptionist && !isAdmin) return <Navigate to="/front-desk" />;
    if (isAccountant && !isAdmin) return <Navigate to="/billing-center" />;
  }

  const tiles: Tile[] = isStaff
    ? [
        { label: "Patients", value: stats.patients, icon: Users, color: "bg-secondary", to: "/patients" },
        { label: "Total staff", value: stats.staff, icon: Stethoscope, color: "bg-primary", to: "/staff-management" },
        { label: "Appointments", value: stats.appts, icon: CalendarCheck, color: "bg-primary", to: "/appointments" },
        { label: "Pending invoices", value: stats.invoices, icon: Wallet, color: "bg-warning", to: "/billing-center" },
        { label: "Lab tests", value: stats.labs, icon: FlaskConical, color: "bg-secondary", to: "/lab-results" },
        { label: "Drugs in stock", value: stats.drugsInStock, icon: Pill, color: "bg-primary", to: "/inventory" },
        { label: "Low-stock items", value: stats.lowStock, icon: Pill, color: "bg-accent", to: "/inventory", search: { filter: "low" }, alert: stats.lowStock > 0 },
      ]
    : [
        { label: "My appointments", value: stats.appts, icon: CalendarCheck, color: "bg-primary", to: "/appointments" },
        { label: "Pending invoices", value: stats.invoices, icon: Wallet, color: "bg-accent", to: "/billing" },
        { label: "Lab results", value: stats.labs, icon: FlaskConical, color: "bg-secondary", to: "/lab-results" },
      ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome back{user?.email ? `, ${user.email.split("@")[0]}` : ""}</h1>
        <p className="text-sm text-muted-foreground">{isAdmin ? "Admin overview" : isStaff ? "Clinic overview" : "Your health at a glance"}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => {
          const inner = (
            <Card className={`relative flex items-center gap-4 p-5 transition-colors ${t.to ? "hover:bg-primary/5 cursor-pointer" : ""}`}>
              <div className={`grid h-12 w-12 place-items-center rounded-lg ${t.color} text-white`}>
                <t.icon className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  {t.label}
                  {t.alert && (
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75 animate-ping" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
                    </span>
                  )}
                </div>
                <div className="text-2xl font-bold">{t.value}</div>
              </div>
              {t.alert && (
                <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Action needed</Badge>
              )}
            </Card>
          );
          return t.to ? (
            <Link key={t.label} to={t.to} search={t.search as never}>{inner}</Link>
          ) : (
            <div key={t.label}>{inner}</div>
          );
        })}
      </div>

      {!isStaff && (
        <Card className="flex flex-col items-start gap-3 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Need to see a doctor?</h3>
            <p className="text-sm text-muted-foreground">Book an appointment in just a few clicks.</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline"><Link to="/doctors"><Stethoscope className="mr-2 h-4 w-4" />Browse doctors</Link></Button>
            <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
              <Link to="/appointments"><CalendarCheck className="mr-2 h-4 w-4" />Book appointment</Link>
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-6">
        <h3 className="mb-3 text-lg font-semibold">Quick links</h3>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          {([
            { to: "/appointments", icon: CalendarCheck, label: "Appointments", badge: isStaff ? quick.todayAppts : 0, tone: "default" as const },
            { to: "/records", icon: FileText, label: "Medical Records", badge: isStaff ? quick.records : 0, tone: "secondary" as const },
            { to: "/lab-results", icon: FlaskConical, label: "Lab Results", badge: isStaff ? quick.newLabs : 0, tone: "destructive" as const },
            { to: isStaff ? "/billing-center" : "/billing", icon: Wallet, label: "Billing", badge: isStaff ? quick.openInvoices : 0, tone: "default" as const },
          ]).map((l) => (
            <Link key={l.label} to={l.to} className="flex items-center justify-between gap-3 rounded-lg border p-3 hover:bg-primary/5">
              <span className="flex items-center gap-3">
                <l.icon className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">{l.label}</span>
              </span>
              {l.badge > 0 && (
                <Badge variant={l.tone === "destructive" ? "destructive" : l.tone === "secondary" ? "secondary" : "default"}>{l.badge}</Badge>
              )}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
