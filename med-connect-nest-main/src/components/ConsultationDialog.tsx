import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Stethoscope, Wand2, PenLine, Layers, Plus, Trash2, FlaskConical, Send, ChevronsUpDown } from "lucide-react";

type Mode = "auto" | "manual" | "hybrid";
type Drug = { id: string; name: string; unit_price: number; stock: number };
type RxLine = { drug_id: string; drug_name: string; dosage: string; frequency: string; quantity: number };
type LabLine = { test_name: string; test_fee: number };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  appointmentId: string;
  patientId: string;
  patientName?: string;
  doctorUserId: string | null;
  reason?: string | null;
  onSaved?: () => void;
};

const empty = { bp: "", pulse: "", temp: "", diagnosis: "", notes: "" };

const autoTemplate = (reason?: string | null) => ({
  bp: "120/80", pulse: "72", temp: "36.8",
  diagnosis: reason ? `Assessment for: ${reason}. Findings within normal limits pending review.` : "Routine consultation. Findings within normal limits.",
  notes: "Patient counselled on medication adherence, hydration, and rest. Follow-up in 1 week if symptoms persist.",
});

const hybridTemplate = (reason?: string | null) => ({
  ...empty,
  diagnosis: reason ? `Re: ${reason} — ` : "",
  notes: "Plan: \nFollow-up: ",
});

type NurseVitals = { bp: string | null; heart_rate: number | null; temperature: number | null; weight: number | null; height: number | null; recorded_at: string };

export function ConsultationDialog({ open, onOpenChange, appointmentId, patientId, patientName, doctorUserId, reason, onSaved }: Props) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [rxLines, setRxLines] = useState<RxLine[]>([]);
  const [labLines, setLabLines] = useState<LabLine[]>([]);
  const [nurseVitals, setNurseVitals] = useState<NurseVitals | null>(null);

  useEffect(() => {
    if (!open) { setMode(null); setForm(empty); setRxLines([]); setLabLines([]); setNurseVitals(null); return; }
    supabase.from("drugs").select("id, name, unit_price, stock").order("name").then(({ data }) => setDrugs((data as Drug[]) ?? []));

    const loadVitals = async (notify = false) => {
      const { data } = await supabase.from("vitals")
        .select("bp, heart_rate, temperature, weight, height, recorded_at")
        .eq("appointment_id", appointmentId)
        .order("recorded_at", { ascending: false }).limit(1).maybeSingle();
      if (!data) return;
      setNurseVitals(data as NurseVitals);
      // Only fill empty fields — don't overwrite the doctor's edits
      setForm((f) => ({
        ...f,
        bp: f.bp || (data.bp ?? ""),
        pulse: f.pulse || (data.heart_rate != null ? String(data.heart_rate) : ""),
        temp: f.temp || (data.temperature != null ? String(data.temperature) : ""),
      }));
      if (notify) toast.message("Nurse updated vitals");
    };

    loadVitals();

    const channel = supabase
      .channel(`vitals-${appointmentId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "vitals", filter: `appointment_id=eq.${appointmentId}` },
        () => loadVitals(true))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [open, appointmentId]);

  useEffect(() => {
    (async () => {
      if (!doctorUserId) return;
      const { data } = await supabase.from("doctors").select("id").eq("profile_id", doctorUserId).maybeSingle();
      setDoctorId((data as { id: string } | null)?.id ?? null);
    })();
  }, [doctorUserId]);

  const pickMode = (m: Mode) => {
    setMode(m);
    if (m === "auto") setForm(autoTemplate(reason));
    else if (m === "hybrid") setForm(hybridTemplate(reason));
    else setForm(empty);
  };

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const addRx = () => setRxLines((l) => [...l, { drug_id: "", drug_name: "", dosage: "", frequency: "", quantity: 1 }]);
  const updRx = (i: number, p: Partial<RxLine>) => setRxLines((l) => l.map((x, idx) => idx === i ? { ...x, ...p } : x));
  const delRx = (i: number) => setRxLines((l) => l.filter((_, idx) => idx !== i));

  const addLab = () => setLabLines((l) => [...l, { test_name: "", test_fee: 0 }]);
  const updLab = (i: number, p: Partial<LabLine>) => setLabLines((l) => l.map((x, idx) => idx === i ? { ...x, ...p } : x));
  const delLab = (i: number) => setLabLines((l) => l.filter((_, idx) => idx !== i));

  const save = async (sendRxToPharmacy: boolean) => {
    if (saving) return;
    if (!patientId || !appointmentId) return toast.error("Missing patient or appointment");
    if (!form.diagnosis.trim()) return toast.error("Diagnosis is required");
    setSaving(true);
    try {
      let effectiveDoctorId = doctorId;
      if (!effectiveDoctorId && doctorUserId) {
        const { data: created, error: docErr } = await supabase
          .from("doctors")
          .upsert({ profile_id: doctorUserId, full_name: "Doctor", specialty: "General Practitioner", consultation_fee: 0 }, { onConflict: "profile_id" })
          .select("id")
          .single();
        if (docErr) throw docErr;
        effectiveDoctorId = (created as { id: string }).id;
        setDoctorId(effectiveDoctorId);
      }

      const { data: rec, error: recErr } = await supabase.from("medical_records").insert({
        patient_id: patientId,
        doctor_id: effectiveDoctorId,
        appointment_id: appointmentId,
        diagnosis: form.diagnosis,
        treatment: rxLines.map((r) => `${r.drug_name} — ${r.dosage} — ${r.frequency}`).join("; ") || null,
        notes: form.notes || null,
      } as never).select("id").single();
      if (recErr) throw recErr;

      if (form.bp || form.pulse || form.temp) {
        await supabase.from("vitals").insert({
          patient_id: patientId,
          appointment_id: appointmentId,
          bp: form.bp || null,
          heart_rate: form.pulse ? Number(form.pulse) : null,
          temperature: form.temp ? Number(form.temp) : null,
        });
      }

      if (rxLines.length > 0) {
        const status = sendRxToPharmacy ? "sent" : "draft";
        const { error: rxErr } = await supabase.from("prescriptions").insert(rxLines.filter((r) => r.drug_name).map((r) => ({
          patient_id: patientId,
          record_id: (rec as { id: string }).id,
          drug_id: r.drug_id || null,
          drug_name: r.drug_name,
          dosage: r.dosage || null,
          duration: r.frequency || null,
          quantity: r.quantity || 1,
          status,
        })));
        if (rxErr) throw rxErr;
      }

      if (labLines.length > 0) {
        const { error: labErr } = await supabase.from("lab_requests").insert(labLines.filter((l) => l.test_name).map((l) => ({
          patient_id: patientId,
          doctor_id: effectiveDoctorId,
          appointment_id: appointmentId,
          test_name: l.test_name,
          test_fee: l.test_fee || 0,
          status: "pending",
        })));
        if (labErr) throw labErr;
      }

      const { data: updated, error: apptErr } = await supabase
        .from("appointments")
        .update({ status: "completed" })
        .eq("id", appointmentId)
        .select("id");
      if (apptErr) throw apptErr;
      if (!updated || updated.length === 0) {
        toast.error("Saved, but couldn't mark appointment completed (permission). Contact admin.");
      } else {
        toast.success(sendRxToPharmacy && rxLines.length ? "Saved & sent to pharmacy. Appointment completed." : "Consultation saved. Appointment completed.");
      }
      onSaved?.();
      // Stay on the consultation page; do not redirect.
    } catch (e: unknown) {
      console.error("[consultation] save failed", e);
      const msg = e instanceof Error ? e.message : (typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "Failed to save consultation");
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Stethoscope className="h-5 w-5" /> Doctor Consultation</DialogTitle>
          {patientName && <p className="text-sm text-muted-foreground">Patient: <span className="font-medium text-foreground">{patientName}</span></p>}
        </DialogHeader>

        {!mode && (
          <div className="grid gap-3 sm:grid-cols-3">
            <ModeCard icon={<Wand2 className="h-5 w-5" />} title="Auto-generate" desc="Pre-fill standard template" onClick={() => pickMode("auto")} />
            <ModeCard icon={<PenLine className="h-5 w-5" />} title="Manual entry" desc="Start from a blank form" onClick={() => pickMode("manual")} />
            <ModeCard icon={<Layers className="h-5 w-5" />} title="Hybrid" desc="Partial template + edits" onClick={() => pickMode("hybrid")} />
          </div>
        )}

        {mode && (
          <div className="space-y-5">
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Vitals from Nurse</h3>
              {nurseVitals ? (
                <div className="rounded-md border bg-muted/40 p-3 text-sm grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div><div className="text-xs text-muted-foreground">BP</div><div className="font-medium">{nurseVitals.bp ?? "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground">Pulse</div><div className="font-medium">{nurseVitals.heart_rate ?? "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground">Temp (°C)</div><div className="font-medium">{nurseVitals.temperature ?? "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground">Weight (kg)</div><div className="font-medium">{nurseVitals.weight ?? "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground">Height (cm)</div><div className="font-medium">{nurseVitals.height ?? "—"}</div></div>
                  <div className="col-span-2 sm:col-span-5 text-xs text-muted-foreground">Recorded {new Date(nurseVitals.recorded_at).toLocaleString()}</div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3">No vitals recorded yet — waiting for nurse.</p>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Vitals (consultation)</h3>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>BP</Label><Input value={form.bp} onChange={set("bp")} placeholder="120/80" /></div>
                <div><Label>Pulse</Label><Input value={form.pulse} onChange={set("pulse")} placeholder="72" /></div>
                <div><Label>Temp (°C)</Label><Input value={form.temp} onChange={set("temp")} placeholder="36.8" /></div>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Diagnosis</h3>
              <Textarea value={form.diagnosis} onChange={set("diagnosis")} rows={3} maxLength={1000} />
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Prescriptions</h3>
                <Button size="sm" variant="outline" onClick={addRx}><Plus className="mr-1 h-3 w-3" /> Add drug</Button>
              </div>
              {rxLines.length === 0 && <p className="text-xs text-muted-foreground">No prescriptions added.</p>}
              {rxLines.map((r, i) => {
                const drug = drugs.find((d) => d.id === r.drug_id);
                const isManual = !r.drug_id && !!r.drug_name;
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 rounded-md border p-2">
                    <div className="col-span-5">
                      <Label className="text-xs">Drug</Label>
                      <DrugCombobox
                        drugs={drugs}
                        value={r.drug_id}
                        text={r.drug_name}
                        onPick={(d) => updRx(i, { drug_id: d.id, drug_name: d.name })}
                        onManual={(name) => updRx(i, { drug_id: "", drug_name: name })}
                      />
                    </div>
                    <div className="col-span-2"><Label className="text-xs">Qty</Label><Input type="number" min={1} value={r.quantity} onChange={(e) => updRx(i, { quantity: Math.max(1, Number(e.target.value) || 1) })} /></div>
                    <div className="col-span-2"><Label className="text-xs">Dosage</Label><Input value={r.dosage} onChange={(e) => updRx(i, { dosage: e.target.value })} placeholder="500mg" /></div>
                    <div className="col-span-2"><Label className="text-xs">Frequency</Label><Input value={r.frequency} onChange={(e) => updRx(i, { frequency: e.target.value })} placeholder="8h × 5d" /></div>
                    <div className="col-span-1 flex items-end justify-end"><Button size="icon" variant="ghost" onClick={() => delRx(i)}><Trash2 className="h-4 w-4" /></Button></div>
                    {drug && (
                      <div className="col-span-12 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>Unit price: <strong className="text-foreground">GHS {Number(drug.unit_price).toFixed(2)}</strong></span>
                        <span>Stock: <strong className={drug.stock < 10 ? "text-destructive" : "text-foreground"}>{drug.stock}</strong></span>
                        <span>Est. cost: GHS {(drug.unit_price * r.quantity).toFixed(2)}</span>
                      </div>
                    )}
                    {isManual && (
                      <div className="col-span-12">
                        <Badge variant="outline" className="text-amber-600 border-amber-600">Manual entry — out of stock for pharmacist</Badge>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2"><FlaskConical className="h-4 w-4" /> Lab tests</h3>
                <Button size="sm" variant="outline" onClick={addLab}><Plus className="mr-1 h-3 w-3" /> Order test</Button>
              </div>
              {labLines.length === 0 && <p className="text-xs text-muted-foreground">No tests ordered.</p>}
              {labLines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 rounded-md border p-2">
                  <div className="col-span-7"><Label className="text-xs">Test name</Label><Input value={l.test_name} onChange={(e) => updLab(i, { test_name: e.target.value })} placeholder="Full Blood Count" /></div>
                  <div className="col-span-4"><Label className="text-xs">Fee (GHS)</Label><Input type="number" step="0.01" min={0} value={l.test_fee} onChange={(e) => updLab(i, { test_fee: Number(e.target.value) || 0 })} /></div>
                  <div className="col-span-1 flex items-end justify-end"><Button size="icon" variant="ghost" onClick={() => delLab(i)}><Trash2 className="h-4 w-4" /></Button></div>
                </div>
              ))}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Doctor Notes</h3>
              <Textarea value={form.notes} onChange={set("notes")} rows={4} maxLength={2000} />
            </section>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <Button variant="ghost" onClick={() => setMode(null)}>Back</Button>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => save(false)} disabled={saving}>Save draft</Button>
                <Button onClick={() => save(true)} disabled={saving}>
                  <Send className="mr-1 h-4 w-4" />{saving ? "Saving…" : (rxLines.length ? "Save & send to pharmacy" : "Save & complete")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ModeCard({ icon, title, desc, onClick }: { icon: React.ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors hover:bg-accent hover:text-accent-foreground">
      <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">{icon}</div>
      <div className="font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground">{desc}</div>
    </button>
  );
}

function DrugCombobox({
  drugs, value, text, onPick, onManual,
}: {
  drugs: Drug[];
  value: string;
  text: string;
  onPick: (d: Drug) => void;
  onManual: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return drugs.slice(0, 30);
    return drugs.filter((d) => d.name.toLowerCase().includes(q)).slice(0, 30);
  }, [drugs, query]);
  const display = text || (value ? drugs.find((d) => d.id === value)?.name : "") || "";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate">{display || "Search medication…"}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Type to search…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>
              {query.trim() ? (
                <button
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => { onManual(query.trim()); setOpen(false); }}
                >
                  + Use manually: <strong>"{query.trim()}"</strong>
                </button>
              ) : (
                <span className="block px-3 py-2 text-sm text-muted-foreground">No results.</span>
              )}
            </CommandEmpty>
            <CommandGroup>
              {filtered.map((d) => (
                <CommandItem
                  key={d.id}
                  value={d.name}
                  onSelect={() => { onPick(d); setOpen(false); setQuery(""); }}
                  className="flex items-center justify-between"
                >
                  <span className="truncate">{d.name}</span>
                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                    GHS {Number(d.unit_price).toFixed(2)} · stock {d.stock}
                  </span>
                </CommandItem>
              ))}
              {query.trim() && !filtered.some((d) => d.name.toLowerCase() === query.trim().toLowerCase()) && (
                <CommandItem
                  value={`__manual__${query}`}
                  onSelect={() => { onManual(query.trim()); setOpen(false); }}
                  className="text-amber-600"
                >
                  + Use manually: "{query.trim()}"
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
