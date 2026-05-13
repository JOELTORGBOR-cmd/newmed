import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Mail, Pencil, UserPlus, UserX, UserCheck } from "lucide-react";
import { doctorName } from "@/lib/utils";

export const Route = createFileRoute("/_app/staff")({
  component: StaffPage,
});

const ROLE_VALUES = ["doctor", "nurse", "admin", "staff", "lab_technician", "pharmacist", "receptionist", "accountant"] as const;
type InviteRole = typeof ROLE_VALUES[number];

const inviteSchema = z.object({
  email: z.string().trim().email().max(255),
  role: z.enum(ROLE_VALUES),
});

type StaffRow = { id: string; full_name: string | null; phone: string | null; status: string; roles: string[] };
type Invite = { id: string; email: string; role: string; status: string; created_at: string };

function StaffPage() {
  const { isAdmin, user, loading, roles } = useAuth();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("doctor");
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [docForm, setDocForm] = useState({ full_name: "", specialty: "", fee: "", bio: "" });
  const [savingDoc, setSavingDoc] = useState(false);

  const openEdit = async (s: StaffRow) => {
    const { data } = await supabase
      .from("doctors")
      .select("specialty, consultation_fee, bio")
      .eq("profile_id", s.id)
      .maybeSingle();
    setDocForm({
      full_name: s.full_name ?? "",
      specialty: data?.specialty ?? "",
      fee: data?.consultation_fee != null ? String(data.consultation_fee) : "",
      bio: data?.bio ?? "",
    });
    setEditing(s);
  };

  const saveDoctor = async () => {
    if (!editing) return;
    setSavingDoc(true);
    const fee = Number(docForm.fee || 0);
    const fullName = docForm.full_name.trim() || "Doctor";
    const { data: existing } = await supabase
      .from("doctors")
      .select("id")
      .eq("profile_id", editing.id)
      .maybeSingle();
    const payload = {
      profile_id: editing.id,
      full_name: fullName,
      specialty: docForm.specialty.trim() || "General Practitioner",
      consultation_fee: isNaN(fee) ? 0 : fee,
      bio: docForm.bio.trim() || null,
    };
    const { error: profErr } = await supabase
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", editing.id);
    const { error } = existing
      ? await supabase.from("doctors").update(payload).eq("id", existing.id)
      : await supabase.from("doctors").insert(payload);
    setSavingDoc(false);
    if (profErr || error) return toast.error((profErr ?? error)!.message);
    toast.success("Doctor profile updated");
    setEditing(null);
    load();
  };

  const load = async () => {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", [...ROLE_VALUES]);
    const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
    let profs: any[] = [];
    if (ids.length) {
      const { data } = await supabase.from("profiles").select("id, full_name, phone, status").in("id", ids);
      profs = data ?? [];
    }
    const merged: StaffRow[] = profs.map((p) => ({
      ...p,
      roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as string),
    }));
    setStaff(merged);

    const { data: inv } = await supabase
      .from("staff_invitations")
      .select("*")
      .order("created_at", { ascending: false });
    setInvites((inv ?? []) as Invite[]);
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  console.debug("[staff] render", { loading, uid: user?.id, roles, isAdmin });
  if (loading || (user && roles.length === 0)) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }
  if (!isAdmin) {
    console.debug("[staff] not admin, blocking");
    return <div className="text-sm text-muted-foreground">Admin access only.</div>;
  }

  const sendInvite = async () => {
    const parsed = inviteSchema.safeParse({ email: email.trim().toLowerCase(), role });
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setSending(true);
    const { error } = await supabase.from("staff_invitations").insert({
      email: parsed.data.email,
      role: parsed.data.role,
      invited_by: user?.id,
    });
    setSending(false);
    if (error) return toast.error(error.message);
    toast.success("Invitation created");
    setEmail("");
    setRole("doctor");
    setOpen(false);
    load();
  };

  const revoke = async (id: string) => {
    const { error } = await supabase.from("staff_invitations").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Invitation revoked");
    load();
  };

  const toggleStatus = async (s: StaffRow) => {
    const next = s.status === "dormant" ? "active" : "dormant";
    if (next === "dormant" && !confirm(`Deactivate ${s.full_name || "this account"}? They will be unable to log in.`)) return;
    const { error } = await supabase.from("profiles").update({ status: next }).eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success(next === "dormant" ? "Account deactivated" : "Account reactivated");
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Staff Management</h1>
          <p className="text-sm text-muted-foreground">Manage doctors, nurses, and admins.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
              <UserPlus className="mr-2 h-4 w-4" /> Invite Staff
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite a new staff member</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="person@school.edu"
                  maxLength={255}
                />
              </div>
              <div>
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as InviteRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="doctor">Doctor</SelectItem>
                    <SelectItem value="nurse">Nurse</SelectItem>
                    <SelectItem value="lab_technician">Lab Technician</SelectItem>
                    <SelectItem value="pharmacist">Pharmacist</SelectItem>
                    <SelectItem value="receptionist">Receptionist</SelectItem>
                    <SelectItem value="accountant">Accountant</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                When this person signs up using this email, they will be granted the selected role automatically.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={sendInvite} disabled={sending}>
                {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send Invite
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="border-b bg-secondary/5 px-4 py-3 font-semibold text-secondary">Current Staff & Doctors</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">No staff yet.</TableCell></TableRow>
            )}
            {staff.map((s) => (
              <TableRow key={s.id} className={s.status === "dormant" ? "opacity-60" : ""}>
                <TableCell className="font-medium">{s.full_name || "—"}</TableCell>
                <TableCell className="text-muted-foreground">{s.phone || "—"}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {s.roles.map((r) => (
                      <Badge key={r} className="bg-secondary text-secondary-foreground capitalize">{r}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge className={s.status === "dormant" ? "bg-muted text-foreground" : "bg-success text-success-foreground"}>
                    {s.status === "dormant" ? "Dormant" : "Active"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right space-x-2">
                  {s.roles.includes("doctor") && (
                    <Button variant="outline" size="sm" onClick={() => openEdit(s)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                    </Button>
                  )}
                  {s.id !== user?.id && (
                    s.status === "dormant" ? (
                      <Button variant="outline" size="sm" onClick={() => toggleStatus(s)}>
                        <UserCheck className="mr-2 h-3.5 w-3.5" /> Reactivate
                      </Button>
                    ) : (
                      <Button variant="destructive" size="sm" onClick={() => toggleStatus(s)}>
                        <UserX className="mr-2 h-3.5 w-3.5" /> Deactivate
                      </Button>
                    )
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="border-b bg-secondary/5 px-4 py-3 font-semibold text-secondary">Pending Invitations</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invites.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">No invitations.</TableCell></TableRow>
            )}
            {invites.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />{i.email}</TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{i.role}</Badge></TableCell>
                <TableCell>
                  <Badge className={i.status === "accepted" ? "bg-success text-success-foreground" : "bg-muted text-foreground"}>
                    {i.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {i.status === "pending" && (
                    <Button variant="ghost" size="sm" onClick={() => revoke(i.id)}>Revoke</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit doctor profile{editing ? ` — ${doctorName(editing.full_name)}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Full name</Label>
              <Input
                value={docForm.full_name}
                onChange={(e) => setDocForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="e.g. Jessi Selasi (the 'Dr.' prefix is added automatically)"
                maxLength={120}
              />
            </div>
            <div>
              <Label>Specialty</Label>
              <Input
                value={docForm.specialty}
                onChange={(e) => setDocForm((f) => ({ ...f, specialty: e.target.value }))}
                placeholder="e.g. Cardiology"
                maxLength={100}
              />
            </div>
            <div>
              <Label>Booking fee (GHS)</Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={docForm.fee}
                onChange={(e) => setDocForm((f) => ({ ...f, fee: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>Bio</Label>
              <Textarea
                value={docForm.bio}
                onChange={(e) => setDocForm((f) => ({ ...f, bio: e.target.value }))}
                placeholder="Short biography shown to patients"
                maxLength={500}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveDoctor} disabled={savingDoc}>
              {savingDoc && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
