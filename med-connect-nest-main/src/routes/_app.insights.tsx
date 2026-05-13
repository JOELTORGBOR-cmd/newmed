import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { BarChart3, Wallet, Users } from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

export const Route = createFileRoute("/_app/insights")({
  component: InsightsPage,
});

const COLORS = ["#2563eb", "#10b981", "#f59e0b"];

function InsightsPage() {
  const { isAdmin, isAccountant, loading } = useAuth();
  const allowed = isAdmin || isAccountant;
  const [revenue, setRevenue] = useState({ consultations: 0, pharmacy: 0, labs: 0 });
  const [flow, setFlow] = useState<Array<{ day: string; checkins: number }>>([]);
  const [weekRevenue, setWeekRevenue] = useState(0);
  const [weekCheckins, setWeekCheckins] = useState(0);

  useEffect(() => {
    if (!allowed) return;
    (async () => {
      const weekStart = new Date(); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - 6);
      const { data: invs } = await supabase
        .from("invoices")
        .select("consultation_fee, medicine_cost, lab_cost, amount, created_at")
        .gte("created_at", weekStart.toISOString());
      const list = invs ?? [];
      const r = list.reduce(
        (acc: { consultations: number; pharmacy: number; labs: number }, i: { consultation_fee: number; medicine_cost: number; lab_cost: number }) => {
          acc.consultations += Number(i.consultation_fee || 0);
          acc.pharmacy += Number(i.medicine_cost || 0);
          acc.labs += Number(i.lab_cost || 0);
          return acc;
        },
        { consultations: 0, pharmacy: 0, labs: 0 }
      );
      setRevenue(r);
      setWeekRevenue(list.reduce((s: number, i: { amount: number }) => s + Number(i.amount || 0), 0));

      // Patient flow this week
      const { data: appts } = await supabase
        .from("appointments")
        .select("checked_in_at")
        .gte("checked_in_at", weekStart.toISOString());
      const buckets: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
        buckets[d.toISOString().slice(0, 10)] = 0;
      }
      (appts ?? []).forEach((a: { checked_in_at: string | null }) => {
        if (!a.checked_in_at) return;
        const k = a.checked_in_at.slice(0, 10);
        if (k in buckets) buckets[k]++;
      });
      const flowArr = Object.entries(buckets).map(([k, v]) => ({
        day: new Date(k).toLocaleDateString([], { weekday: "short" }),
        checkins: v,
      }));
      setFlow(flowArr);
      setWeekCheckins(flowArr.reduce((s, x) => s + x.checkins, 0));
    })();
  }, [allowed]);

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!allowed) return <div className="text-sm text-muted-foreground">Admin or Accountant access only.</div>;

  const pieData = [
    { name: "Consultations", value: revenue.consultations },
    { name: "Pharmacy", value: revenue.pharmacy },
    { name: "Labs", value: revenue.labs },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" /> Hospital Insights
        </h1>
        <p className="text-sm text-muted-foreground">Revenue and patient flow for the last 7 days.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-success/10 text-success"><Wallet className="h-5 w-5" /></div>
          <div><div className="text-xs text-muted-foreground">Revenue this week</div><div className="text-2xl font-bold">GHS {weekRevenue.toFixed(2)}</div></div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><Users className="h-5 w-5" /></div>
          <div><div className="text-xs text-muted-foreground">Check-ins this week</div><div className="text-2xl font-bold">{weekCheckins}</div></div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Revenue by Department</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={90} label={(e: { name: string; value: number }) => `${e.name}: GHS ${Number(e.value).toFixed(0)}`}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => `GHS ${Number(v).toFixed(2)}`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Patient Flow (last 7 days)</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={flow}>
                <XAxis dataKey="day" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="checkins" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
