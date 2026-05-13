import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pill, Check, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/pharmacy")({
  component: PharmacyPage,
});

type Rx = {
  id: string; patient_id: string; drug_name: string; dosage: string | null; duration: string | null;
  quantity: number; status: string; drug_id: string | null; created_at: string;
};

function PharmacyPage() {
  const { isStaff, isAdmin, isPharmacist } = useAuth();
  const [rx, setRx] = useState<Rx[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [lowStock, setLowStock] = useState<Array<{ id: string; name: string; stock: number }>>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const allowed = isStaff || isAdmin || isPharmacist;

  const load = async () => {
    const { data } = await supabase.from("prescriptions")
      .select("*").in("status", ["sent", "draft"])
      .order("created_at", { ascending: false });
    const list = (data as Rx[]) ?? [];
    setRx(list);
    const ids = Array.from(new Set(list.map((r) => r.patient_id)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: { id: string; full_name: string }) => { map[p.id] = p.full_name; });
      setNames(map);
    }
    const drugIds = Array.from(new Set(list.map((r) => r.drug_id).filter(Boolean) as string[]));
    if (drugIds.length) {
      const { data: drugs } = await supabase.from("drugs").select("id, stock").in("id", drugIds);
      const sm: Record<string, number> = {};
      (drugs ?? []).forEach((d: { id: string; stock: number }) => { sm[d.id] = d.stock; });
      setStockMap(sm);
    }
    const { data: low } = await supabase.from("drugs").select("id, name, stock").lt("stock", 50).order("stock");
    setLowStock(low ?? []);
  };

  useEffect(() => { if (allowed) load(); }, [allowed]);

  const dispense = async (id: string) => {
    setBusy(id);
    const { error } = await supabase.from("prescriptions").update({ status: "dispensed" }).eq("id", id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Dispensed — stock decremented and patient billed");
    load();
  };

  const cancel = async (id: string) => {
    setBusy(id);
    const { error } = await supabase.from("prescriptions").update({ status: "cancelled" }).eq("id", id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Prescription cancelled — not billed");
    load();
  };

  if (!allowed) return <div className="text-sm text-muted-foreground">Pharmacy staff access only.</div>;

  const queue = rx.filter((r) => r.status === "sent");
  const drafts = rx.filter((r) => r.status === "draft");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Pill className="h-6 w-6 text-primary" /> Pharmacy Queue</h1>
        <p className="text-sm text-muted-foreground">Dispense prescriptions sent from doctors.</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Awaiting dispense ({queue.length})</h2>
        <Card className="divide-y">
          {queue.length === 0 && <div className="p-4 text-sm text-muted-foreground">No prescriptions in the queue.</div>}
          {queue.map((r) => {
            const stock = r.drug_id ? stockMap[r.drug_id] : undefined;
            const isLow = stock !== undefined && stock < 50;
            const isManual = !r.drug_id;
            return (
              <div key={r.id} className={`flex items-center justify-between p-4 ${isManual ? "bg-amber-50" : isLow ? "bg-destructive/10" : ""}`}>
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {r.drug_name} <span className="text-xs text-muted-foreground">× {r.quantity}</span>
                    {isManual && <Badge className="bg-amber-500 text-white">Out of stock — manual entry</Badge>}
                    {!isManual && isLow && <Badge className="bg-destructive text-destructive-foreground">Low stock: {stock}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">{names[r.patient_id] ?? "Patient"} • {[r.dosage, r.duration].filter(Boolean).join(" • ")}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" className="bg-success text-success-foreground hover:bg-success/90" disabled={busy === r.id || isManual} onClick={() => dispense(r.id)}>
                    <Check className="mr-1 h-4 w-4" /> {busy === r.id ? "…" : isManual ? "Source externally" : "Dispense"}
                  </Button>
                  <Button size="sm" variant="destructive" disabled={busy === r.id} onClick={() => cancel(r.id)}>
                    <X className="mr-1 h-4 w-4" /> Cancel
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      </section>

      {lowStock.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-destructive">Low-stock alert ({lowStock.length})</h2>
          <Card className="divide-y border-destructive/30">
            {lowStock.map((d) => (
              <div key={d.id} className="flex items-center justify-between p-4 bg-destructive/5">
                <div className="font-medium">{d.name}</div>
                <Badge className="bg-destructive text-destructive-foreground">{d.stock} units left</Badge>
              </div>
            ))}
          </Card>
        </section>
      )}

      {drafts.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Drafts (not yet sent) ({drafts.length})</h2>
          <Card className="divide-y">
            {drafts.map((r) => (
              <div key={r.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="font-medium">{r.drug_name} <span className="text-xs text-muted-foreground">× {r.quantity}</span></div>
                  <div className="text-xs text-muted-foreground">{names[r.patient_id] ?? "Patient"}</div>
                </div>
                <Badge variant="outline">Draft</Badge>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
