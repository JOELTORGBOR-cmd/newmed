import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { Activity, HeartPulse } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/queue")({
  component: QueuePage,
});

type Appt = { id: string; scheduled_at: string; status: string; patient_id: string; reason: string | null };

function QueuePage() {
  const { isStaff, isNurse, isAdmin } = useAuth();
  const [appts, setAppts] = useState<Appt[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [target, setTarget] = useState<Appt | null>(null);
  const [vitals, setVitals] = useState({ bp: "", pulse: "", temp: "", weight: "" });
  const [saving, setSaving] = useState(false);

  const allowed = isStaff || isNurse || isAdmin;

  const load = async () => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    const { data } = await supabase
      .from("appointments")
      .select("id, scheduled_at, status, patient_id, reason")
      .gte("scheduled_at", start.toISOString())
      .lte("scheduled_at", end.toISOString())
      .order("scheduled_at");
    const list = (data as Appt[]) ?? [];
    setAppts(list);
    const ids = Array.from(new Set(list.map((a) => a.patient_id)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: { id: string; full_name: string }) => { map[p.id] = p.full_name; });
      setNames(map);
    }
  };

  useEffect(() => { if (allowed) load(); }, [allowed]);

  const saveVitals = async () => {
    if (!target) return;
    setSaving(true);
    const { error } = await supabase.from("vitals").insert({
      patient_id: target.patient_id,
      appointment_id: target.id,
      bp: vitals.bp || null,
      heart_rate: vitals.pulse ? Number(vitals.pulse) : null,
      temperature: vitals.temp ? Number(vitals.temp) : null,
      weight: vitals.weight ? Number(vitals.weight) : null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Vitals recorded");
    setTarget(null);
    setVitals({ bp: "", pulse: "", temp: "", weight: "" });
  };

  if (!allowed) return <div className="text-sm text-muted-foreground">Nurse / staff access only.</div>;

  const groups: Record<string, Appt[]> = { awaiting_payment: [], waiting_for_nurse: [], pending: [], confirmed: [], completed: [], cancelled: [] };
  appts.forEach((a) => { (groups[a.status] ??= []).push(a); });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><HeartPulse className="h-6 w-6 text-primary" /> Patient Queue</h1>
        <p className="text-sm text-muted-foreground">Today's appointments. Record vitals before the doctor sees the patient.</p>
      </div>

      {(["awaiting_payment", "waiting_for_nurse", "pending", "confirmed", "completed", "cancelled"] as const).map((s) => (
        <section key={s} className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold capitalize">{s.replaceAll("_", " ")}</h2>
            <span className="text-xs text-muted-foreground">({groups[s]?.length ?? 0})</span>
          </div>
          <Card className="divide-y">
            {(!groups[s] || groups[s].length === 0) && <div className="p-4 text-sm text-muted-foreground">None.</div>}
            {groups[s]?.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="font-medium">{names[a.patient_id] ?? "Patient"}</div>
                  <div className="text-xs text-muted-foreground">{new Date(a.scheduled_at).toLocaleTimeString()} {a.reason ? `• ${a.reason}` : ""}</div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={a.status} />
                  <Button size="sm" variant="outline" onClick={() => setTarget(a)}>
                    <Activity className="mr-1 h-4 w-4" /> Record vitals
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        </section>
      ))}

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record vitals{target ? ` — ${names[target.patient_id] ?? ""}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div><Label>BP</Label><Input value={vitals.bp} onChange={(e) => setVitals({ ...vitals, bp: e.target.value })} placeholder="120/80" /></div>
            <div><Label>Pulse (bpm)</Label><Input type="number" value={vitals.pulse} onChange={(e) => setVitals({ ...vitals, pulse: e.target.value })} placeholder="72" /></div>
            <div><Label>Temp (°C)</Label><Input type="number" step="0.1" value={vitals.temp} onChange={(e) => setVitals({ ...vitals, temp: e.target.value })} placeholder="36.8" /></div>
            <div><Label>Weight (kg)</Label><Input type="number" step="0.1" value={vitals.weight} onChange={(e) => setVitals({ ...vitals, weight: e.target.value })} placeholder="70" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
            <Button onClick={saveVitals} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
