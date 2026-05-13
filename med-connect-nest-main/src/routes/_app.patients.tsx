import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Search } from "lucide-react";

export const Route = createFileRoute("/_app/patients")({
  component: PatientsPage,
});

type Row = { id: string; full_name: string | null; phone: string | null; student_id: string | null; dob: string | null; created_at: string };

function PatientsPage() {
  const { isStaff, loading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!isStaff) return;
    (async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "patient");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (!ids.length) { setRows([]); return; }
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, phone, student_id, dob, created_at")
        .in("id", ids)
        .order("created_at", { ascending: false });
      setRows((data ?? []) as Row[]);
    })();
  }, [isStaff]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      (r.full_name ?? "").toLowerCase().includes(s) ||
      (r.phone ?? "").toLowerCase().includes(s) ||
      (r.student_id ?? "").toLowerCase().includes(s),
    );
  }, [rows, q]);

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!isStaff) return <div className="text-sm text-muted-foreground">Staff access only.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6" /> Patients</h1>
          <p className="text-sm text-muted-foreground">Registered patients in the system.</p>
        </div>
        <Badge variant="secondary">{rows.length} total</Badge>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone, student ID…" className="pl-9" />
      </div>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Student ID</TableHead>
              <TableHead>DOB</TableHead>
              <TableHead>Registered</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">No patients found.</TableCell></TableRow>
            )}
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.full_name || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{r.phone || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{r.student_id || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{r.dob || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
