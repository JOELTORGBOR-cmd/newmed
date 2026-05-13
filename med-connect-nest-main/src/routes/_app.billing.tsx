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
import { StatusBadge } from "@/components/StatusBadge";
import { Wallet, Smartphone } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/billing")({
  component: BillingPage,
});

function BillingPage() {
  const { user, isStaff } = useAuth();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [paymentsByInv, setPaymentsByInv] = useState<Record<string, any[]>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [pay, setPay] = useState({ network: "MTN", phone: "" });

  const load = async () => {
    if (!user) return;
    let q = supabase.from("invoices").select("*").order("created_at", { ascending: false });
    if (!isStaff) q = q.eq("patient_id", user.id);
    const { data } = await q;
    setInvoices(data ?? []);
    const ids = (data ?? []).map((i: any) => i.id);
    if (ids.length) {
      const { data: pays } = await supabase.from("payments").select("*").in("invoice_id", ids).order("created_at", { ascending: false });
      const m: Record<string, any[]> = {};
      (pays ?? []).forEach((p: any) => { (m[p.invoice_id] ??= []).push(p); });
      setPaymentsByInv(m);
    }
  };
  useEffect(() => { load(); }, [user, isStaff]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("billing-invoices")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, isStaff]);

  const processPayment = async () => {
    const inv = invoices.find((i) => i.id === open);
    if (!inv || !user) return;
    if (!/^\d{9,12}$/.test(pay.phone.replace(/\s/g, ""))) return toast.error("Enter a valid Mobile Money number");
    const reference = "MOMO-" + Math.random().toString(36).slice(2, 8).toUpperCase();
    const masked = pay.phone.replace(/.(?=.{3})/g, "*");
    const { error: pe } = await supabase.from("payments").insert({
      invoice_id: inv.id, patient_id: inv.patient_id, provider: "momo_mock",
      network: pay.network, phone_masked: masked, reference, amount: inv.amount, status: "success",
    });
    if (pe) return toast.error(pe.message);
    toast.success(`Payment submitted. Awaiting accountant verification. Ref: ${reference}`);
    setOpen(null); setPay({ network: "MTN", phone: "" });
    load();
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Billing</h1><p className="text-sm text-muted-foreground">Pay invoices with Mobile Money.</p></div>
      <Card className="divide-y">
        {invoices.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No invoices.</div>}
        {invoices.map((inv) => (
          <div key={inv.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-warning/10 text-warning"><Wallet className="h-5 w-5" /></div>
              <div>
                <div className="font-semibold">{inv.description ?? "Invoice"}</div>
                <div className="text-sm text-muted-foreground">{new Date(inv.created_at).toLocaleDateString()}</div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                  <div>Consult: <span className="font-medium">GHS {Number(inv.consultation_fee ?? 0).toFixed(2)}</span></div>
                  <div>Meds: <span className="font-medium">GHS {Number(inv.medicine_cost ?? 0).toFixed(2)}</span></div>
                  <div>Lab: <span className="font-medium">GHS {Number(inv.lab_cost ?? 0).toFixed(2)}</span></div>
                  <div>Service 10%: <span className="font-medium">GHS {Number(inv.service_charge ?? 0).toFixed(2)}</span></div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-lg font-bold">GHS {Number(inv.amount).toFixed(2)}</div>
                <StatusBadge status={inv.status} />
              </div>
              {inv.status === "pending" && !isStaff && (
                <Dialog open={open === inv.id} onOpenChange={(o) => setOpen(o ? inv.id : null)}>
                  <DialogTrigger asChild>
                    <Button className="bg-accent text-accent-foreground hover:bg-accent/90"><Smartphone className="mr-2 h-4 w-4" />Pay Now</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Mobile Money payment</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>Network</Label>
                        <Select value={pay.network} onValueChange={(v) => setPay({ ...pay, network: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="MTN">MTN</SelectItem>
                            <SelectItem value="Vodafone">Vodafone</SelectItem>
                            <SelectItem value="AirtelTigo">AirtelTigo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div><Label>Mobile Money number</Label><Input value={pay.phone} onChange={(e) => setPay({ ...pay, phone: e.target.value })} placeholder="0244123456" maxLength={20} /></div>
                      <div className="rounded-lg bg-muted p-3 text-sm">
                        Amount: <span className="font-bold">GHS {Number(inv.amount).toFixed(2)}</span>
                      </div>
                      <Button onClick={processPayment} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">Authorize payment</Button>
                      <p className="text-xs text-muted-foreground text-center">Demo flow — no real money is moved.</p>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
            {paymentsByInv[inv.id]?.length > 0 && (
              <div className="md:col-span-2 mt-2 border-t pt-2">
                <div className="text-xs font-semibold text-muted-foreground mb-1">Payment history</div>
                <div className="space-y-1">
                  {paymentsByInv[inv.id].map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-xs">
                      <span>{new Date(p.created_at).toLocaleString()} • {p.provider}{p.network ? ` (${p.network})` : ""}</span>
                      <span className="font-mono">{p.reference} — GHS {Number(p.amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
