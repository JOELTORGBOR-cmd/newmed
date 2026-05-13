import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bell, Send } from "lucide-react";
import { toast } from "sonner";

const HOSPITAL_NAME = "MediCare Hospital";

export const Route = createFileRoute("/_app/reminders")({
  component: RemindersPage,
});

type Row = {
  id: string;
  patient_id: string;
  scheduled_at: string;
  doctor_email: string | null;
  patient_name: string;
  doctor_name: string;
  reminded: boolean;
};

function RemindersPage() {
  const { user, isReceptionist, isAdmin, loading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  const allowed = isReceptionist || isAdmin;

  const load = async () => {
    const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);

    const { data: appts } = await supabase
      .from("appointments")
      .select("id, patient_id, scheduled_at, doctor_email, doctor_id")
      .gte("scheduled_at", start.toISOString())
      .lt("scheduled_at", end.toISOString())
      .neq("status", "cancelled");

    const apptArr = appts ?? [];
    const patientIds = [...new Set(apptArr.map((a) => a.patient_id))];
    const doctorIds = [...new Set(apptArr.map((a) => a.doctor_id).filter(Boolean) as string[])];
    const apptIds = apptArr.map((a) => a.id);

    const [profilesRes, doctorsRes, remRes] = await Promise.all([
      patientIds.length
        ? supabase.from("profiles").select("id, full_name").in("id", patientIds)
        : Promise.resolve({ data: [] as any[] }),
      doctorIds.length
        ? supabase.from("doctors").select("id, full_name").in("id", doctorIds)
        : Promise.resolve({ data: [] as any[] }),
      apptIds.length
        ? supabase.from("appointment_reminders").select("appointment_id, channel, created_on").in("appointment_id", apptIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const remindedSet = new Set(
      (remRes.data ?? [])
        .filter((r: any) => r.channel === "in_app" && r.created_on === today)
        .map((r: any) => r.appointment_id)
    );

    const pmap = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p.full_name]));
    const dmap = new Map((doctorsRes.data ?? []).map((d: any) => [d.id, d.full_name]));

    setRows(
      apptArr.map((a) => ({
        id: a.id,
        patient_id: a.patient_id,
        scheduled_at: a.scheduled_at,
        doctor_email: a.doctor_email,
        patient_name: pmap.get(a.patient_id) ?? "Patient",
        doctor_name: a.doctor_id ? dmap.get(a.doctor_id) ?? "Doctor" : "your doctor",
        reminded: remindedSet.has(a.id),
      }))
    );
  };

  useEffect(() => { if (allowed) load(); }, [allowed]);

  const sendOne = async (r: Row) => {
    const when = new Date(r.scheduled_at);
    const message = `Hello ${r.patient_name}, this is a reminder that you have an appointment tomorrow at ${when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} with Dr. ${r.doctor_name} at ${HOSPITAL_NAME}.`;
    const { error } = await supabase.from("appointment_reminders").insert({
      appointment_id: r.id,
      patient_id: r.patient_id,
      sent_by: user?.id,
      channel: "in_app",
      message,
    });
    if (error) {
      if (error.code === "23505") { toast.info(`${r.patient_name}: already reminded today`); }
      else { toast.error(`${r.patient_name}: ${error.message}`); return false; }
    } else {
      toast.success(`Reminder sent to ${r.patient_name}`);
    }
    return true;
  };

  const sendAll = async () => {
    setBusy(true);
    let ok = 0;
    for (const r of rows.filter((r) => !r.reminded)) {
      if (await sendOne(r)) ok++;
    }
    setBusy(false);
    toast.success(`Bulk reminders processed (${ok}).`);
    load();
  };

  if (loading) return null;
  if (!allowed) return <Navigate to="/dashboard" />;

  const pending = rows.filter((r) => !r.reminded).length;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" /> Tomorrow's appointments</CardTitle>
          <Button onClick={sendAll} disabled={busy || pending === 0}>
            <Send className="mr-2 h-4 w-4" /> Send to all ({pending})
          </Button>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No appointments scheduled for tomorrow.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.patient_name}</TableCell>
                    <TableCell>{new Date(r.scheduled_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</TableCell>
                    <TableCell>Dr. {r.doctor_name}</TableCell>
                    <TableCell>
                      {r.reminded ? <Badge variant="secondary">Sent today</Badge> : <Badge>Pending</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant={r.reminded ? "outline" : "default"}
                        onClick={async () => { await sendOne(r); load(); }}>
                        Send Reminder
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
