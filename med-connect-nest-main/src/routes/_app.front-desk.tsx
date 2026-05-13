import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConciergeBell, CheckCheck, Wallet } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/front-desk")({
  component: FrontDeskPage,
});

type Appt = {
  id: string; scheduled_at: string; status: string; patient_id: string; doctor_id: string | null;
  reason: string | null; checked_in_at: string | null;
};

function FrontDeskPage() {
  const { isReceptionist, isAdmin, loading } = useAuth();
  const allowed = isReceptionist || isAdmin;
  const [appts, setAppts] = useState<Appt[]>([]);
  const [patients, setPatients] = useState<Record<string, string>>({});
  const [doctors, setDoctors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const { data } = await supabase
      .from("appointments")
      .select("id, scheduled_at, status, patient_id, doctor_id, reason, checked_in_at")
      .gte("scheduled_at", start.toISOString())
      .lte("scheduled_at", end.toISOString())
      .order("scheduled_at");
    const list = (data as Appt[]) ?? [];
    setAppts(list);
    const pids = Array.from(new Set(list.map((a) => a.patient_id)));
    const dids = Array.from(new Set(list.map((a) => a.doctor_id).filter(Boolean) as string[]));
    if (pids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", pids);
      const m: Record<string, string> = {};
      (profs ?? []).forEach((p: { id: string; full_name: string }) => { m[p.id] = p.full_name; });
      setPatients(m);
    }
    if (dids.length) {
      const { data: docs } = await supabase.from("doctors").select("id, full_name").in("id", dids);
      const m: Record<string, string> = {};
      (docs ?? []).forEach((d: { id: string; full_name: string }) => { m[d.id] = d.full_name; });
      setDoctors(m);
    }
  };

  useEffect(() => { if (allowed) load(); }, [allowed]);

  const checkIn = async (a: Appt) => {
    setBusy(a.id);
    const { error } = await supabase
      .from("appointments")
      .update({ status: "awaiting_payment", checked_in_at: new Date().toISOString() })
      .eq("id", a.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Checked in — consultation invoice created. Awaiting payment.");
    load();
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!allowed) return <div className="text-sm text-muted-foreground">Receptionist access only.</div>;

  const checkedInCount = appts.filter((a) => a.checked_in_at).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ConciergeBell className="h-6 w-6 text-primary" /> Front Desk
        </h1>
        <p className="text-sm text-muted-foreground">Today's appointments. Check patients in to send them to the nurse queue.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Today's appointments</div><div className="text-2xl font-bold">{appts.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Checked in</div><div className="text-2xl font-bold text-success">{checkedInCount}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Awaiting check-in</div><div className="text-2xl font-bold text-warning">{appts.length - checkedInCount}</div></Card>
      </div>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead>Doctor</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {appts.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No appointments today.</TableCell></TableRow>
            )}
            {appts.map((a) => {
              const isCheckedIn = !!a.checked_in_at;
              return (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{new Date(a.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</TableCell>
                  <TableCell>{patients[a.patient_id] ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{a.doctor_id ? doctors[a.doctor_id] ?? "—" : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{a.reason ?? "—"}</TableCell>
                  <TableCell>
                    <Badge className={isCheckedIn ? "bg-success text-success-foreground" : "bg-secondary text-secondary-foreground"}>
                      {a.status.replaceAll("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {!isCheckedIn ? (
                      <Button size="sm" disabled={busy === a.id} onClick={() => checkIn(a)}>
                        <CheckCheck className="mr-1 h-4 w-4" /> {busy === a.id ? "…" : "Check-In"}
                      </Button>
                    ) : a.status === "awaiting_payment" ? (
                      <Button asChild size="sm" variant="outline">
                        <Link to="/billing-center"><Wallet className="mr-1 h-4 w-4" /> Process Payment</Link>
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {new Date(a.checked_in_at!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
