import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Search, FileText, ShieldAlert, Mail } from "lucide-react";
import { toast } from "sonner";
import { doctorName } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin-records")({
  component: AdminRecordsPage,
});

type Row = {
  id: string;
  visit_date: string;
  created_at: string;
  diagnosis: string | null;
  treatment: string | null;
  notes: string | null;
  patient_id: string;
  doctor_id: string | null;
  patient_name: string;
  doctor_name: string;
};

function AdminRecordsPage() {
  const { user, isAdmin, isDoctor, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [emailQuery, setEmailQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [emergency, setEmergency] = useState<{ id: string; full_name: string; email: string } | null>(null);
  const [summary, setSummary] = useState<{ records: any[]; labs: any[]; allergies: any[] } | null>(null);
  const canViewAllRecords = isAdmin || isDoctor;

  useEffect(() => {
    if (!canViewAllRecords) return;
    (async () => {
      setLoading(true);
      const { data: records } = await supabase
        .from("medical_records")
        .select("*")
        .order("created_at", { ascending: false });
      const recs = records ?? [];
      const patientIds = Array.from(new Set(recs.map((r) => r.patient_id)));
      const doctorIds = Array.from(new Set(recs.map((r) => r.doctor_id).filter(Boolean) as string[]));

      const [{ data: patients }, { data: doctors }] = await Promise.all([
        patientIds.length
          ? supabase.from("profiles").select("id, full_name").in("id", patientIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
        doctorIds.length
          ? supabase.from("doctors").select("id, full_name").in("id", doctorIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      ]);

      const pmap = new Map((patients ?? []).map((p) => [p.id, p.full_name]));
      const dmap = new Map((doctors ?? []).map((d) => [d.id, doctorName(d.full_name)]));

      setRows(
        recs.map((r) => ({
          ...r,
          patient_name: pmap.get(r.patient_id) ?? "—",
          doctor_name: r.doctor_id ? dmap.get(r.doctor_id) ?? "—" : "—",
        })),
      );
      setLoading(false);
    })();
  }, [canViewAllRecords]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (r) =>
        r.patient_name.toLowerCase().includes(term) ||
        r.doctor_name.toLowerCase().includes(term),
    );
  }, [rows, q]);

  const runEmergencySearch = async () => {
    const email = emailQuery.trim().toLowerCase();
    if (!email) return;
    setSearching(true);
    try {
      const { data, error } = await supabase.rpc("find_patient_by_email", { _email: email });
      if (error) throw error;
      const patient = (data ?? [])[0] as { id: string; full_name: string; email: string } | undefined;
      if (!patient) { toast.error("No patient found with that email"); return; }

      // Check if doctor has an existing appointment with this patient
      const { count } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("patient_id", patient.id)
        .eq("doctor_email", user?.email ?? "");

      const isEmergency = (count ?? 0) === 0;
      if (isEmergency) {
        await supabase.from("activity_logs").insert({
          user_id: user?.id ?? null,
          action: "emergency_record_access",
          patient_id: patient.id,
          metadata: { via: "email_search", email },
        });
        toast.warning("Emergency access — this lookup has been logged for audit.");
      }

      const [r, l, a] = await Promise.all([
        supabase.from("medical_records").select("*").eq("patient_id", patient.id).order("visit_date", { ascending: false }).limit(20),
        supabase.from("lab_results").select("*").eq("patient_id", patient.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("allergies").select("*").eq("patient_id", patient.id),
      ]);
      setSummary({ records: r.data ?? [], labs: l.data ?? [], allergies: a.data ?? [] });
      setEmergency(patient);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  if (authLoading) return <div className="p-6">Loading…</div>;
  if (!canViewAllRecords) return <Navigate to="/dashboard" />;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">All Medical Records</h1>
      </div>

      {isDoctor && (
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <ShieldAlert className="h-4 w-4 text-warning" />
            Emergency / referral lookup — search any patient by email
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={emailQuery}
                onChange={(e) => setEmailQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runEmergencySearch()}
                placeholder="patient@email.com"
                className="pl-9"
                type="email"
              />
            </div>
            <Button onClick={runEmergencySearch} disabled={searching}>
              {searching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Open record
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Patients without an appointment with you are flagged and access is logged for audit.
          </p>
        </Card>
      )}

      <Card className="p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search visit history by patient or doctor name…"
            className="pl-9"
          />
        </div>
      </Card>

      <Card className="overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center p-10 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading records…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">No records found.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Diagnosis</TableHead>
                <TableHead>Treatment</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{r.visit_date}</TableCell>
                  <TableCell className="font-medium">{r.patient_name}</TableCell>
                  <TableCell>{r.doctor_name}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{r.diagnosis ?? "—"}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{r.treatment ?? "—"}</TableCell>
                  <TableCell className="max-w-[260px] truncate">{r.notes ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <div className="border-t p-3 text-xs text-muted-foreground">
          {filtered.length} record{filtered.length === 1 ? "" : "s"}
        </div>
      </Card>

      <Dialog open={!!emergency} onOpenChange={(o) => { if (!o) { setEmergency(null); setSummary(null); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-warning" />
              {emergency?.full_name} — Medical summary
            </DialogTitle>
            <p className="text-xs text-muted-foreground">{emergency?.email}</p>
          </DialogHeader>
          {summary && (
            <div className="space-y-4 text-sm">
              <section>
                <h3 className="mb-1 font-semibold">Allergies</h3>
                {summary.allergies.length === 0 ? <p className="text-muted-foreground">No known allergies.</p>
                  : <ul className="list-disc pl-5">{summary.allergies.map((a: any) => <li key={a.id}>{a.allergen} ({a.severity})</li>)}</ul>}
              </section>
              <section>
                <h3 className="mb-1 font-semibold">Recent visits ({summary.records.length})</h3>
                {summary.records.length === 0 ? <p className="text-muted-foreground">No visits.</p>
                  : <ul className="space-y-2">{summary.records.map((r: any) => (
                      <li key={r.id} className="rounded-md border p-2">
                        <div className="text-xs text-muted-foreground">{r.visit_date}</div>
                        <div className="font-medium">{r.diagnosis ?? "Visit"}</div>
                        {r.treatment && <div className="text-xs">Tx: {r.treatment}</div>}
                      </li>
                    ))}</ul>}
              </section>
              <section>
                <h3 className="mb-1 font-semibold">Recent lab results ({summary.labs.length})</h3>
                {summary.labs.length === 0 ? <p className="text-muted-foreground">No results.</p>
                  : <ul className="space-y-1">{summary.labs.map((l: any) => (
                      <li key={l.id} className="text-xs"><span className="font-medium">{l.test_name}</span> — {l.result_summary ?? "—"}</li>
                    ))}</ul>}
              </section>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
