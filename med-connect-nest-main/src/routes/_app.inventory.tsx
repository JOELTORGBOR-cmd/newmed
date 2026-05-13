import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pill } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/inventory")({
  component: InventoryPage,
  validateSearch: (s: Record<string, unknown>) => ({ filter: (s.filter as string) || "" }),
});

function InventoryPage() {
  const { isStaff } = useAuth();
  const search = useSearch({ from: "/_app/inventory" });
  const [drugs, setDrugs] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<string>(search.filter || "all");
  const [form, setForm] = useState({ name: "", category: "", stock: 0, unit_price: 0, low_stock_threshold: 10 });

  const load = () => supabase.from("drugs").select("*").order("name").then(({ data }) => setDrugs(data ?? []));
  useEffect(() => { if (isStaff) load(); }, [isStaff]);
  useEffect(() => { setFilter(search.filter || "all"); }, [search.filter]);
  useEffect(() => {
    const ch = supabase.channel("inv-drugs")
      .on("postgres_changes", { event: "*", schema: "public", table: "drugs" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const visible = useMemo(() => {
    if (filter === "low") return drugs.filter((d) => (d.stock ?? 0) <= (d.low_stock_threshold ?? 0));
    if (filter === "out") return drugs.filter((d) => (d.stock ?? 0) === 0);
    return drugs;
  }, [drugs, filter]);

  if (!isStaff) return <div className="text-sm text-muted-foreground">Staff access only.</div>;

  const add = async () => {
    if (!form.name) return toast.error("Name required");
    const { error } = await supabase.from("drugs").insert(form);
    if (error) return toast.error(error.message);
    toast.success("Drug added");
    setOpen(false); setForm({ name: "", category: "", stock: 0, unit_price: 0, low_stock_threshold: 10 });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Drug inventory</h1><p className="text-sm text-muted-foreground">Track stock and dispense.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" />Add drug</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add a new drug</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={100} /></div>
              <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} maxLength={50} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Stock</Label><Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: +e.target.value })} /></div>
                <div><Label>Price (GHS)</Label><Input type="number" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: +e.target.value })} /></div>
                <div><Label>Low @</Label><Input type="number" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: +e.target.value })} /></div>
              </div>
              <Button onClick={add} className="w-full">Add drug</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all","low","out"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f === "low" ? "Low / Out of stock" : "Out of stock only"}
          </Button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((d) => {
          const low = (d.stock ?? 0) <= (d.low_stock_threshold ?? 0);
          return (
            <Card key={d.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Pill className="h-5 w-5 text-primary" />
                  <div>
                    <div className="font-semibold">{d.name}</div>
                    <div className="text-xs text-muted-foreground">{d.category}</div>
                  </div>
                </div>
                {low ? <Badge className="bg-warning text-warning-foreground">Low stock</Badge> : <Badge className="bg-success text-success-foreground">In stock</Badge>}
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span>Stock: <span className="font-bold">{d.stock}</span></span>
                <span>GHS {Number(d.unit_price).toFixed(2)}</span>
              </div>
            </Card>
          );
        })}
        {visible.length === 0 && <div className="text-sm text-muted-foreground">No drugs match this filter.</div>}
      </div>
    </div>
  );
}
