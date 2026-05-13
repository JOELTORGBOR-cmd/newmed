import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FlaskConical, Download } from "lucide-react";
import { toast } from "sonner";
import { doctorName } from "@/lib/utils";

export const Route = createFileRoute("/_app/records")({
  component: RecordsPage,
});

function RecordsPage() {
  const { user, isPatient, isAdmin, isReceptionist, loading: authLoading } = useAuth();
  if (!authLoading && (isReceptionist || (!isPatient && !isAdmin))) {
    return <Navigate to="/dashboard" />;
  }
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<any[]>([]);
  const [rx, setRx] = useState<any[]>([]);
  const [allergies, setAllergies] = useState<any[]>([]);
  const [vitals, setVitals] = useState<any[]>([]);
  const [labs, setLabs] = useState<any[]>([]);
  const [doctorMap, setDoctorMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    const pid = user.id;
    setLoading(true);
    Promise.all([
      supabase.from("medical_records").select("*").eq("patient_id", pid).order("visit_date", { ascending: false }),
      supabase.from("prescriptions").select("*").eq("patient_id", pid).order("created_at", { ascending: false }),
      supabase.from("allergies").select("*").eq("patient_id", pid),
      supabase.from("vitals").select("*").eq("patient_id", pid).order("recorded_at", { ascending: false }),
      supabase.from("lab_results").select("*").eq("patient_id", pid).order("created_at", { ascending: false }),
    ]).then(async ([r, p, a, v, l]) => {
      const recs = r.data ?? [];
      setRecords(recs);
      setRx(p.data ?? []);
      setAllergies(a.data ?? []);
      setVitals(v.data ?? []);
      setLabs(l.data ?? []);

      const doctorIds = Array.from(new Set(recs.map((x: any) => x.doctor_id).filter(Boolean)));
      if (doctorIds.length) {
        const { data: docs } = await supabase.from("doctors").select("id, full_name, specialty").in("id", doctorIds);
        const map: Record<string, string> = {};
        (docs ?? []).forEach((d: any) => { map[d.id] = `${doctorName(d.full_name)}${d.specialty ? ` • ${d.specialty}` : ""}`; });
        setDoctorMap(map);
      }

      // Mark unseen lab results as viewed (powers the "New Result" badge)
      const unseen = (l.data ?? []).filter((x: any) => !x.viewed_at).map((x: any) => x.id);
      if (unseen.length) {
        await supabase.from("lab_results").update({ viewed_at: new Date().toISOString() }).in("id", unseen);
      }
      setLoading(false);
    });
  }, [user]);

  const newLabs = labs.filter((l) => !l.viewed_at).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Medical records</h1>
        <p className="text-sm text-muted-foreground">Your visit history and clinical info.</p>
      </div>
      <Tabs defaultValue="visits">
        <TabsList>
          <TabsTrigger value="visits">Visits ({records.length})</TabsTrigger>
          <TabsTrigger value="rx">Prescriptions ({rx.length})</TabsTrigger>
          <TabsTrigger value="labs">
            Lab Results ({labs.length})
            {newLabs > 0 && <Badge className="ml-2 bg-destructive text-destructive-foreground">New</Badge>}
          </TabsTrigger>
          <TabsTrigger value="allergies">Allergies ({allergies.length})</TabsTrigger>
          <TabsTrigger value="vitals">Vitals ({vitals.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="visits">
          <Card className="divide-y">
            {loading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
            ) : records.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No visit records yet.
              </div>
            ) : (
              records.map((r) => (
                <div key={r.id} className="p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{r.diagnosis ?? "Visit"}</div>
                    <div className="text-sm text-muted-foreground">{r.visit_date}</div>
                  </div>
                  {r.doctor_id && doctorMap[r.doctor_id] && (
                    <div className="text-xs text-muted-foreground">
                      Seen by {doctorMap[r.doctor_id]}
                    </div>
                  )}
                  {r.treatment && (
                    <div className="text-sm">
                      <span className="font-medium">Treatment:</span> {r.treatment}
                    </div>
                  )}
                  {r.notes && (
                    <div className="text-sm text-muted-foreground">{r.notes}</div>
                  )}
                </div>
              ))
            )}
          </Card>
        </TabsContent>

        <TabsContent value="rx">
          <Card className="divide-y">
            {rx.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No prescriptions.
              </div>
            ) : (
              rx.map((p) => {
                const statusColor = p.status === "dispensed" ? "bg-success text-success-foreground"
                  : p.status === "sent" ? "bg-warning text-warning-foreground"
                  : "bg-muted text-foreground";
                const statusLabel = p.status === "dispensed" ? "Dispensed"
                  : p.status === "sent" ? "At Pharmacy"
                  : "Pending";
                return (
                  <div key={p.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{p.drug_name}{p.quantity > 1 ? ` × ${p.quantity}` : ""}</div>
                      <div className="flex items-center gap-2">
                        <Badge className={statusColor}>{statusLabel}</Badge>
                        <div className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">{[p.dosage, p.duration].filter(Boolean).join(" • ")}</div>
                    {p.instructions && <div className="mt-1 text-sm">{p.instructions}</div>}
                  </div>
                );
              })
            )}
          </Card>
        </TabsContent>

        <TabsContent value="labs">
          <Card className="divide-y">
            {labs.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No lab results yet.
              </div>
            ) : (
              labs.map((l) => {
                const statusColor =
                  l.status === "completed"
                    ? "bg-success text-success-foreground"
                    : "bg-warning text-warning-foreground";
                const download = async () => {
                  if (!l.file_path) return toast.info("No file attached");
                  const { data, error } = await supabase.storage
                    .from("lab-results")
                    .createSignedUrl(l.file_path, 60);
                  if (error) return toast.error(error.message);
                  window.open(data.signedUrl, "_blank");
                };
                return (
                  <div key={l.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary/10 text-secondary">
                        <FlaskConical className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-semibold">{l.test_name}</div>
                        <div className="text-xs text-muted-foreground">
                          Uploaded {new Date(l.created_at).toLocaleDateString()}
                        </div>
                        {l.result_summary && (
                          <div className="mt-1 text-sm">
                            <span className="font-medium">Result:</span> {l.result_summary}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={statusColor}>{l.status}</Badge>
                      {l.file_path && (
                        <Button size="sm" variant="outline" onClick={download}>
                          <Download className="mr-1 h-4 w-4" />
                          Download
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </Card>
        </TabsContent>

        <TabsContent value="allergies">
          <Card className="p-4">
            {allergies.length === 0 ? (
              <div className="text-sm text-muted-foreground">No known allergies.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {allergies.map((a) => (
                  <Badge key={a.id} variant="outline">
                    {a.allergen} ({a.severity})
                  </Badge>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="vitals">
          <Card className="divide-y">
            {vitals.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No vitals recorded.
              </div>
            ) : (
              vitals.map((v) => (
                <div
                  key={v.id}
                  className="grid grid-cols-2 gap-2 p-4 text-sm md:grid-cols-5"
                >
                  <div className="text-muted-foreground">
                    {new Date(v.recorded_at).toLocaleDateString()}
                  </div>
                  <div>
                    BP: <span className="font-semibold">{v.bp ?? "—"}</span>
                  </div>
                  <div>
                    HR: <span className="font-semibold">{v.heart_rate ?? "—"}</span>
                  </div>
                  <div>
                    Temp:{" "}
                    <span className="font-semibold">
                      {v.temperature ?? "—"}
                      {v.temperature ? "°C" : ""}
                    </span>
                  </div>
                  <div>
                    Wt:{" "}
                    <span className="font-semibold">
                      {v.weight ?? "—"}
                      {v.weight ? " kg" : ""}
                    </span>
                  </div>
                </div>
              ))
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
