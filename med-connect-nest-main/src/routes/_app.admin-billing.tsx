import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { Wallet, Search } from "lucide-react";

export const Route = createFileRoute("/_app/admin-billing")({
  component: AdminBilling,
});

type Inv = {
  id: string; patient_id: string; appointment_id: string | null; status: string;
  consultation_fee: number; medicine_cost: number; lab_cost: number; service_charge: number;
  amount: number; created_at: string; description: string | null;
};

function AdminBilling() {
  const { isAdmin, loading } = useAuth();
  const [invoices, setInvoices] = useState<Inv[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data } = await supabase.from("invoices").select("*").order("created_at", { ascending: false });
      const list = (data as Inv[]) ?? [];
      setInvoices(list);
      const ids = Array.from(new Set(list.map((i) => i.patient_id)));
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        const map: Record<string, string> = {};
        (profs ?? []).forEach((p: { id: string; full_name: string }) => { map[p.id] = p.full_name; });
        setNames(map);
      }
    })();
  }, [isAdmin]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return invoices;
    return invoices.filter((i) => (names[i.patient_id] ?? "").toLowerCase().includes(term) || i.id.toLowerCase().includes(term));
  }, [invoices, names, q]);

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!isAdmin) return <Navigate to="/dashboard" />;

  const totals = invoices.reduce((acc, i) => {
    acc.total += Number(i.amount); if (i.status === "pending") acc.pending += Number(i.amount); else acc.paid += Number(i.amount);
    return acc;
  }, { total: 0, pending: 0, paid: 0 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="h-6 w-6 text-warning" /> All Invoices</h1>
        <p className="text-sm text-muted-foreground">Master billing dashboard. Invoices are auto-generated when consultations complete.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total billed</div><div className="text-2xl font-bold">GHS {totals.total.toFixed(2)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Pending</div><div className="text-2xl font-bold text-warning">GHS {totals.pending.toFixed(2)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Paid</div><div className="text-2xl font-bold text-success">GHS {totals.paid.toFixed(2)}</div></Card>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search by patient or invoice id" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Patient</TableHead>
              <TableHead className="text-right">Consult</TableHead>
              <TableHead className="text-right">Meds</TableHead>
              <TableHead className="text-right">Lab</TableHead>
              <TableHead className="text-right">Svc 10%</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && <TableRow><TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">No invoices.</TableCell></TableRow>}
            {filtered.map((i) => (
              <TableRow key={i.id}>
                <TableCell>{new Date(i.created_at).toLocaleDateString()}</TableCell>
                <TableCell>{names[i.patient_id] ?? "—"}</TableCell>
                <TableCell className="text-right">{Number(i.consultation_fee).toFixed(2)}</TableCell>
                <TableCell className="text-right">{Number(i.medicine_cost).toFixed(2)}</TableCell>
                <TableCell className="text-right">{Number(i.lab_cost).toFixed(2)}</TableCell>
                <TableCell className="text-right">{Number(i.service_charge).toFixed(2)}</TableCell>
                <TableCell className="text-right font-semibold">GHS {Number(i.amount).toFixed(2)}</TableCell>
                <TableCell><StatusBadge status={i.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
