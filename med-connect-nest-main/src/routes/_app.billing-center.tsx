import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { Calculator, Search, Check, Download, TrendingUp, X, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { downloadReceipt } from "@/lib/receipts";

export const Route = createFileRoute("/_app/billing-center")({
  component: BillingCenterPage,
});

type Inv = {
  id: string; patient_id: string; appointment_id: string | null; status: string;
  consultation_fee: number; medicine_cost: number; lab_cost: number; service_charge: number;
  amount: number; created_at: string; description: string | null; paid_at: string | null;
};

type Pay = {
  id: string; invoice_id: string; patient_id: string; amount: number; reference: string;
  provider: string; network: string | null; status: string; created_at: string;
};

function BillingCenterPage() {
  const { isAccountant, isAdmin, isReceptionist, user, loading } = useAuth();
  const allowed = isAccountant || isAdmin || isReceptionist;
  const [invoices, setInvoices] = useState<Inv[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [latestPay, setLatestPay] = useState<Record<string, Pay>>({});
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [revenueToday, setRevenueToday] = useState(0);

  const load = async () => {
    const { data } = await supabase.from("invoices").select("*").order("created_at", { ascending: false });
    const list = (data as Inv[]) ?? [];
    setInvoices(list);
    const ids = Array.from(new Set(list.map((i) => i.patient_id)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const m: Record<string, string> = {};
      (profs ?? []).forEach((p: { id: string; full_name: string }) => { m[p.id] = p.full_name; });
      setNames(m);
    }
    const { data: pays } = await supabase
      .from("payments").select("*").order("created_at", { ascending: false });
    const pm: Record<string, Pay> = {};
    (pays ?? []).forEach((p: Pay) => { if (!pm[p.invoice_id]) pm[p.invoice_id] = p; });
    setLatestPay(pm);

    const start = new Date(); start.setHours(0, 0, 0, 0);
    const { data: today } = await supabase
      .from("payments").select("amount")
      .eq("status", "success").gte("created_at", start.toISOString());
    setRevenueToday((today ?? []).reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0));
  };

  useEffect(() => { if (allowed) load(); }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    const ch = supabase
      .channel("billing-center")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [allowed]);

  const approveAsPaid = async (inv: Inv) => {
    if (!user) return;
    setBusy(inv.id);
    const { error } = await supabase.from("invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", inv.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Approved as paid");
    handleReceipt(inv);
    load();
  };

  const rejectPayment = async (inv: Inv) => {
    if (!user) return;
    setBusy(inv.id);
    const pay = latestPay[inv.id];
    if (pay) {
      await supabase.from("payments").update({ status: "failed" }).eq("id", pay.id);
    }
    const { error } = await supabase.from("invoices").update({ status: "pending" }).eq("id", inv.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Payment rejected");
    load();
  };

  const recordCash = async (inv: Inv) => {
    if (!user) return;
    setBusy(inv.id);
    const reference = "CASH-" + Math.random().toString(36).slice(2, 8).toUpperCase();
    const { error } = await supabase.from("payments").insert({
      invoice_id: inv.id, patient_id: inv.patient_id, provider: "cash",
      reference, amount: inv.amount, status: "success",
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`Cash recorded (${reference}). Sent to Verify Payments.`);
    load();
  };

  const handleReceipt = (inv: Inv) => {
    downloadReceipt({
      id: inv.id,
      patient_name: names[inv.patient_id] ?? "Patient",
      created_at: inv.created_at,
      consultation_fee: inv.consultation_fee,
      medicine_cost: inv.medicine_cost,
      lab_cost: inv.lab_cost,
      service_charge: inv.service_charge,
      amount: inv.amount,
      status: inv.status === "pending_verification" ? "paid" : inv.status,
      payment_ref: latestPay[inv.id]?.reference ?? null,
    });
  };

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return invoices;
    return invoices.filter((i) => (names[i.patient_id] ?? "").toLowerCase().includes(term) || i.id.toLowerCase().includes(term));
  }, [invoices, names, q]);

  const pendingVerification = useMemo(
    () => invoices.filter((i) => i.status === "pending_verification"),
    [invoices]
  );

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!allowed) return <div className="text-sm text-muted-foreground">Accountant access only.</div>;

  const totalPending = invoices.filter((i) => i.status === "pending" || i.status === "pending_verification").reduce((s, i) => s + Number(i.amount), 0);
  const totalPaid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.amount), 0);

  // Receptionist: read-only view limited to a searched patient's payment status.
  if (isReceptionist && !isAccountant && !isAdmin) {
    const term = q.trim().toLowerCase();
    const results = term
      ? invoices.filter((i) => (names[i.patient_id] ?? "").toLowerCase().includes(term) || i.id.toLowerCase().includes(term))
      : [];
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calculator className="h-6 w-6 text-primary" /> Patient Payment Lookup
          </h1>
          <p className="text-sm text-muted-foreground">Search a patient to see whether their invoice is paid. Only the accountant can verify or approve payments.</p>
        </div>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by patient name or invoice id" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {term && (
          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No invoices match.</TableCell></TableRow>
                ) : results.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{new Date(i.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>{names[i.patient_id] ?? "—"}</TableCell>
                    <TableCell className="text-right font-semibold">GHS {Number(i.amount).toFixed(2)}</TableCell>
                    <TableCell><StatusBadge status={i.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calculator className="h-6 w-6 text-primary" /> Billing Center
        </h1>
        <p className="text-sm text-muted-foreground">Manage invoices, verify payments, and download receipts.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4 border-l-4 border-l-success">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" /> Total Revenue Today
          </div>
          <div className="text-2xl font-bold">GHS {revenueToday.toFixed(2)}</div>
        </Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Pending invoices</div><div className="text-2xl font-bold text-warning">GHS {totalPending.toFixed(2)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">All-time paid</div><div className="text-2xl font-bold text-success">GHS {totalPaid.toFixed(2)}</div></Card>
      </div>

      <Tabs defaultValue={pendingVerification.length > 0 ? "verify" : "all"}>
        <TabsList>
          <TabsTrigger value="all">All Invoices</TabsTrigger>
          <TabsTrigger value="verify" className="gap-2">
            Verify Payments
            {pendingVerification.length > 0 && (
              <Badge className="bg-amber-500 text-white">{pendingVerification.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
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
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No invoices.</TableCell></TableRow>}
                {filtered.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{new Date(i.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>{names[i.patient_id] ?? "—"}</TableCell>
                    <TableCell className="text-right font-semibold">GHS {Number(i.amount).toFixed(2)}</TableCell>
                    <TableCell><StatusBadge status={i.status} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {i.status === "pending" && (
                          <Button size="sm" variant="outline" disabled={busy === i.id} onClick={() => recordCash(i)}>
                            <Check className="mr-1 h-3.5 w-3.5" /> Record Cash
                          </Button>
                        )}
                        {i.status === "paid" && (
                          <Button size="sm" variant="outline" onClick={() => handleReceipt(i)}>
                            <Download className="mr-1 h-3.5 w-3.5" /> Receipt
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="verify" className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-amber-500" />
            Review pending MoMo and Cash payments. Approve to mark the invoice as Paid and release the workflow.
          </div>
          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingVerification.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No payments awaiting verification.</TableCell></TableRow>
                )}
                {pendingVerification.map((i) => {
                  const p = latestPay[i.id];
                  return (
                    <TableRow key={i.id}>
                      <TableCell>{p ? new Date(p.created_at).toLocaleString() : "—"}</TableCell>
                      <TableCell>{names[i.patient_id] ?? "—"}</TableCell>
                      <TableCell className="capitalize">{p ? `${p.provider}${p.network ? ` (${p.network})` : ""}` : "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{p?.reference ?? "—"}</TableCell>
                      <TableCell className="text-right font-semibold">GHS {Number(i.amount).toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" disabled={busy === i.id} onClick={() => approveAsPaid(i)} className="bg-success text-success-foreground hover:bg-success/90">
                            <Check className="mr-1 h-3.5 w-3.5" /> Approve as Paid
                          </Button>
                          <Button size="sm" variant="outline" disabled={busy === i.id} onClick={() => rejectPayment(i)}>
                            <X className="mr-1 h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
