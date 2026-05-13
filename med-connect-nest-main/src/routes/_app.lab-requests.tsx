import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { FlaskConical, Upload } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/lab-requests")({
  component: LabRequestsPage,
});

type Req = {
  id: string; patient_id: string; doctor_id: string | null; appointment_id: string | null;
  test_name: string; test_fee: number; status: string; created_at: string;
};

function LabRequestsPage() {
  const { isLabTech, isAdmin, isStaff } = useAuth();
  const [reqs, setReqs] = useState<Req[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [target, setTarget] = useState<Req | null>(null);
  const [summary, setSummary] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const allowed = isLabTech || isAdmin || isStaff;

  const load = async () => {
    const { data } = await supabase.from("lab_requests").select("*").order("created_at", { ascending: false });
    const list = (data as Req[]) ?? [];
    setReqs(list);
    const ids = Array.from(new Set(list.map((r) => r.patient_id)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: { id: string; full_name: string }) => { map[p.id] = p.full_name; });
      setNames(map);
    }
  };

  useEffect(() => { if (allowed) load(); }, [allowed]);

  const upload = async () => {
    if (!target) return;
    setSaving(true);
    let file_path: string | null = null;
    if (file) {
      const path = `${target.patient_id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("lab-results").upload(path, file);
      if (upErr) { setSaving(false); return toast.error(upErr.message); }
      file_path = path;
    }
    const { data: lab, error: insErr } = await supabase.from("lab_results").insert({
      patient_id: target.patient_id,
      doctor_id: target.doctor_id,
      test_name: target.test_name,
      result_summary: summary || null,
      file_path,
      status: "completed",
    }).select("id").single();
    if (insErr) { setSaving(false); return toast.error(insErr.message); }

    const { error: updErr } = await supabase.from("lab_requests")
      .update({ status: "completed", result_id: lab.id })
      .eq("id", target.id);
    setSaving(false);
    if (updErr) return toast.error(updErr.message);
    toast.success("Result uploaded — fee added to invoice");
    setTarget(null); setSummary(""); setFile(null);
    load();
  };

  if (!allowed) return <div className="text-sm text-muted-foreground">Lab technician access only.</div>;

  const awaiting = reqs.filter((r) => r.status === "awaiting_payment");
  const pending = reqs.filter((r) => r.status === "pending");
  const completed = reqs.filter((r) => r.status === "completed");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><FlaskConical className="h-6 w-6 text-secondary" /> Lab Requests</h1>
        <p className="text-sm text-muted-foreground">Only paid tests are released for processing. Uploading a result completes the order.</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Ready for testing ({pending.length})</h2>
        <Card className="divide-y">
          {pending.length === 0 && <div className="p-4 text-sm text-muted-foreground">No tests ready yet.</div>}
          {pending.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-4">
              <div>
                <div className="font-medium">{r.test_name}</div>
                <div className="text-xs text-muted-foreground">{names[r.patient_id] ?? "Patient"} • Fee GHS {Number(r.test_fee).toFixed(2)} • {new Date(r.created_at).toLocaleDateString()}</div>
              </div>
              <Button size="sm" onClick={() => setTarget(r)}><Upload className="mr-1 h-4 w-4" /> Upload result</Button>
            </div>
          ))}
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Awaiting payment ({awaiting.length})</h2>
        <Card className="divide-y">
          {awaiting.length === 0 && <div className="p-4 text-sm text-muted-foreground">None.</div>}
          {awaiting.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-4 opacity-70">
              <div>
                <div className="font-medium">{r.test_name}</div>
                <div className="text-xs text-muted-foreground">{names[r.patient_id] ?? "Patient"} • GHS {Number(r.test_fee).toFixed(2)} • Awaiting payment</div>
              </div>
              <span className="rounded-md bg-warning/10 px-2 py-1 text-xs font-medium text-warning">Awaiting Payment</span>
            </div>
          ))}
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Completed ({completed.length})</h2>
        <Card className="divide-y">
          {completed.length === 0 && <div className="p-4 text-sm text-muted-foreground">None yet.</div>}
          {completed.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-4">
              <div>
                <div className="font-medium">{r.test_name}</div>
                <div className="text-xs text-muted-foreground">{names[r.patient_id] ?? "Patient"} • {new Date(r.created_at).toLocaleDateString()}</div>
              </div>
              <StatusBadge status={r.status} />
            </div>
          ))}
        </Card>
      </section>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload lab result{target ? ` — ${target.test_name}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Result summary</Label><Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} maxLength={1000} /></div>
            <div><Label>Result file (optional)</Label><Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
            <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
              Test fee: <span className="font-bold text-foreground">GHS {target ? Number(target.test_fee).toFixed(2) : "0.00"}</span> will be added to the patient's invoice automatically.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
            <Button onClick={upload} disabled={saving}>{saving ? "Uploading…" : "Submit result"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
