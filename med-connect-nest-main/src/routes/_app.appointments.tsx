import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { ConsultationDialog } from "@/components/ConsultationDialog";
import { Plus, CalendarCheck, Stethoscope, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { doctorName } from "@/lib/utils";

export const Route = createFileRoute("/_app/appointments")({
  component: AppointmentsPage,
});

type Appt = { id: string; scheduled_at: string; reason: string | null; status: string; doctor_id: string | null; patient_id: string };
type Doctor = { id: string; full_name: string; specialty: string };
type Patient = { id: string; full_name: string };

function AppointmentsPage() {
  const { user, isStaff, isDoctor, isAdmin, isReceptionist, loading: authLoading } = useAuth();
  const [appts, setAppts] = useState<Appt[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [patients, setPatients] = useState<Record<string, string>>({});
  const [vitalsReady, setVitalsReady] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ doctor_id: "", date: "", time: "", reason: "" });
  const [consult, setConsult] = useState<Appt | null>(null);

  const load = async () => {
    if (!user) return;
    let q = supabase.from("appointments").select("*").order("scheduled_at", { ascending: false });
    if (!isStaff) q = q.eq("patient_id", user.id);
    const { data } = await q;
    const list = (data as Appt[]) ?? [];
    setAppts(list);
    const { data: docs } = await supabase.from("doctors").select("id, full_name, specialty").eq("status", "active");
    setDoctors((docs as Doctor[]) ?? []);
    const pids = Array.from(new Set(list.map((a) => a.patient_id)));
    if (pids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", pids);
      const map: Record<string, string> = {};
      ((profs as Patient[]) ?? []).forEach((p) => { map[p.id] = p.full_name; });
      setPatients(map);
    }
    const aids = list.map((a) => a.id);
    if (aids.length) {
      const { data: v } = await supabase.from("vitals").select("appointment_id").in("appointment_id", aids);
      const vmap: Record<string, boolean> = {};
      (v ?? []).forEach((row: { appointment_id: string | null }) => { if (row.appointment_id) vmap[row.appointment_id] = true; });
      setVitalsReady(vmap);
    } else {
      setVitalsReady({});
    }
  };
  useEffect(() => { load(); }, [user, isStaff]);

  // Realtime: when a nurse saves vitals for one of these appointments, light up the badge
  useEffect(() => {
    if (!appts.length) return;
    const ch = supabase
      .channel("vitals-ready")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "vitals" }, (payload) => {
        const aid = (payload.new as { appointment_id?: string }).appointment_id;
        if (aid && appts.some((a) => a.id === aid)) {
          setVitalsReady((m) => ({ ...m, [aid]: true }));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [appts]);

  const book = async () => {
    if (!user) return;
    if (!form.doctor_id || !form.date || !form.time) return toast.error("Fill all required fields");
    const scheduled_at = new Date(`${form.date}T${form.time}`).toISOString();
    const { error } = await supabase.from("appointments").insert({
      patient_id: user.id, doctor_id: form.doctor_id, scheduled_at, reason: form.reason, status: "pending",
    });
    if (error) return toast.error(error.message);
    toast.success("Appointment requested");
    setOpen(false); setForm({ doctor_id: "", date: "", time: "", reason: "" });
    load();
  };

  const setStatus = async (id: string, status: "confirmed" | "cancelled" | "completed") => {
    const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const docName = (id: string | null) => doctorName(doctors.find((d) => d.id === id)?.full_name);

  // Receptionists can view/book appointments but cannot start consultations.

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Appointments</h1>
          <p className="text-sm text-muted-foreground">Book and manage your visits.</p>
        </div>
        {!isStaff && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-accent text-accent-foreground hover:bg-accent/90"><Plus className="mr-2 h-4 w-4" />Book appointment</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Book an appointment</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Doctor</Label>
                  <Select value={form.doctor_id} onValueChange={(v) => setForm({ ...form, doctor_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select a doctor" /></SelectTrigger>
                    <SelectContent>
                      {doctors.map((d) => <SelectItem key={d.id} value={d.id}>{doctorName(d.full_name)} — {d.specialty}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
                  <div><Label>Time</Label><Input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></div>
                </div>
                <div><Label>Reason</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} maxLength={500} /></div>
                <Button onClick={book} className="w-full">Confirm booking</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="divide-y">
        {appts.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No appointments yet.</div>}
        {appts.map((a) => (
          <div key={a.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><CalendarCheck className="h-5 w-5" /></div>
              <div>
                <div className="font-semibold">{docName(a.doctor_id)}</div>
                <div className="text-sm text-muted-foreground">{new Date(a.scheduled_at).toLocaleString()}</div>
                {a.reason && <div className="mt-1 text-sm">{a.reason}</div>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={a.status} />
              {vitalsReady[a.id] && (
                <Badge className="bg-emerald-600 text-white"><Activity className="mr-1 h-3 w-3" />Vitals Ready</Badge>
              )}
              {isStaff && !isReceptionist && a.status === "pending" && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setStatus(a.id, "confirmed")}>Confirm</Button>
                  <Button size="sm" variant="ghost" onClick={() => setStatus(a.id, "cancelled")}>Cancel</Button>
                </>
              )}
              {isStaff && a.status === "awaiting_payment" && (
                <Badge className="bg-warning text-warning-foreground">Awaiting payment</Badge>
              )}
              {(isDoctor || isAdmin) && a.status === "confirmed" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConsult(a)}
                >
                  <Stethoscope className="mr-2 h-4 w-4" />
                  Start consultation
                </Button>
              )}
              {a.status === "completed" && (
                <Badge variant="secondary" className="bg-muted text-muted-foreground">Completed</Badge>
              )}
            </div>
          </div>
        ))}
      </Card>
      {consult && (
        <ConsultationDialog
          open={!!consult}
          onOpenChange={(v) => !v && setConsult(null)}
          appointmentId={consult.id}
          patientId={consult.patient_id}
          patientName={patients[consult.patient_id] ?? ""}
          doctorUserId={user?.id ?? null}
          reason={consult.reason}
          onSaved={load}
        />
      )}
    </div>
  );
}
