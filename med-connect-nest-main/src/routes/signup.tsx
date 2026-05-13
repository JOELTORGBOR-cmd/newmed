import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stethoscope, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

const baseSchema = {
  fullName: z.string().trim().min(2, "Name too short").max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(7).max(20),
  dob: z.string().min(1, "Date of birth required"),
  password: z.string().min(8, "At least 8 characters").max(100),
};
const patientSchema = z.object({ ...baseSchema, studentId: z.string().trim().min(2, "ID Number required").max(50) });
const staffSchema = z.object({ ...baseSchema, studentId: z.string().optional() });

function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: "", studentId: "", email: "", phone: "", dob: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [isInvited, setIsInvited] = useState(false);
  const [checkingInvite, setCheckingInvite] = useState(false);

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const checkInvite = async () => {
    const email = form.email.trim();
    if (!email || !z.string().email().safeParse(email).success) {
      setIsInvited(false);
      return;
    }
    setCheckingInvite(true);
    const { data, error } = await supabase.rpc("email_has_invitation", { _email: email });
    setCheckingInvite(false);
    if (error) {
      console.error("[signup] invite check error", error);
      setIsInvited(false);
      return;
    }
    setIsInvited(Boolean(data));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = (isInvited ? staffSchema : patientSchema).safeParse(form);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setLoading(true);
    const { data: signUpData, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: form.fullName, student_id: form.studentId, phone: form.phone, dob: form.dob },
      },
    });
    if (error) {
      setLoading(false);
      return toast.error(error.message);
    }

    // The DB trigger handle_new_user() auto-assigns an invited role
    // (doctor/staff/admin) when this email exists in staff_invitations.
    // Read it back to route the user to the correct landing page.
    const uid = signUpData.user?.id;
    let assignedRole: string | null = null;
    if (uid) {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid);
      const roles = (roleRows ?? []).map((r) => r.role);
      assignedRole =
        roles.find((r) => r === "admin") ??
        roles.find((r) => r === "doctor" || r === "staff") ??
        roles[0] ??
        null;
    }
    setLoading(false);

    if (assignedRole && assignedRole !== "patient") {
      toast.success(`Welcome! Account created as ${assignedRole}.`);
      navigate({ to: "/staff" });
    } else {
      toast.success("Account created!");
      navigate({ to: "/dashboard" });
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-muted px-4 py-10">
      <Card className="w-full max-w-md p-8">
        <Link to="/" className="mb-6 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Stethoscope className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold">MediCare</span>
        </Link>
        <h1 className="text-2xl font-bold">Create your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign up to access MediCare.</p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <div><Label>Full name</Label><Input value={form.fullName} onChange={update("fullName")} maxLength={100} /></div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={update("email")} onBlur={checkInvite} placeholder="you@example.com" maxLength={255} />
            {checkingInvite && <p className="mt-1 text-xs text-muted-foreground">Checking…</p>}
            {isInvited && <p className="mt-1 text-xs text-primary">Staff invitation found — ID Number not required.</p>}
          </div>
          {!isInvited && (
            <div><Label>ID Number</Label><Input value={form.studentId} onChange={update("studentId")} placeholder="STU-2024-001" maxLength={50} /></div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Phone</Label><Input value={form.phone} onChange={update("phone")} placeholder="0244123456" maxLength={20} /></div>
            <div><Label>Date of birth</Label><Input type="date" value={form.dob} onChange={update("dob")} /></div>
          </div>
          <div><Label>Password</Label><Input type="password" value={form.password} onChange={update("password")} maxLength={100} /></div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create account
          </Button>
        </form>
        <div className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account? <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link>
        </div>
      </Card>
    </div>
  );
}
