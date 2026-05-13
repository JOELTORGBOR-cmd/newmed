import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Stethoscope, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"patient" | "staff">("patient");
  const [email, setEmail] = useState("");
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back!");
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id;
    console.debug("[login] session uid:", uid);
    if (uid) {
      const { data: roles, error: rolesErr } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      console.debug("[login] roles query:", { roles, rolesErr });
      const list = (roles ?? []).map((r) => r.role as string);
      console.debug("[login] role list:", list);
      if (list.includes("admin")) { return navigate({ to: "/staff" }); }
      if (list.includes("doctor")) { return navigate({ to: "/admin-records" }); }
      if (list.includes("lab_technician")) { return navigate({ to: "/lab-requests" }); }
      if (list.includes("nurse")) { return navigate({ to: "/queue" }); }
      if (list.includes("pharmacist")) { return navigate({ to: "/pharmacy" }); }
      if (list.includes("receptionist")) { return navigate({ to: "/front-desk" }); }
      if (list.includes("accountant")) { return navigate({ to: "/billing-center" }); }
      if (list.includes("staff")) { return navigate({ to: "/appointments" }); }
    }
    console.debug("[login] -> /dashboard (fallback)");
    navigate({ to: "/dashboard" });
  };

  const fillDemo = (kind: "patient" | "doctor" | "admin") => {
    const map = {
      patient: { email: "student@demo.edu", password: "password123" },
      doctor: { email: "doctor@demo.edu", password: "password123" },
      admin: { email: "admin@demo.edu", password: "password123" },
    };
    setEmail(map[kind].email);
    setPassword(map[kind].password);
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
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Welcome back. Pick your account type.</p>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "patient" | "staff")} className="mt-5">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="patient">Patient (Student)</TabsTrigger>
            <TabsTrigger value="staff">Staff / Doctor</TabsTrigger>
          </TabsList>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <TabsContent value="patient" className="space-y-4">
              <div>
                <Label>Student ID</Label>
                <Input value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="e.g. STU-2024-001" maxLength={50} />
              </div>
              <div>
                <Label>Student email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" required maxLength={255} />
              </div>
            </TabsContent>

            <TabsContent value="staff" className="space-y-4">
              <div>
                <Label>Work email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@clinic.com" required maxLength={255} />
              </div>
            </TabsContent>

            <div>
              <Label>Password</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required maxLength={100} />
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Sign in
            </Button>
          </form>
        </Tabs>

        <div className="mt-4 text-center text-sm text-muted-foreground">
          New patient? <Link to="/signup" className="font-medium text-primary hover:underline">Create an account</Link>
        </div>

        <div className="mt-6 rounded-lg border bg-muted/50 p-3 text-xs text-muted-foreground">
          <div className="font-semibold text-foreground">Demo accounts</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => fillDemo("patient")} className="rounded-md bg-white px-2 py-1 hover:bg-primary/10">Patient</button>
            <button type="button" onClick={() => fillDemo("doctor")} className="rounded-md bg-white px-2 py-1 hover:bg-primary/10">Doctor</button>
            <button type="button" onClick={() => fillDemo("admin")} className="rounded-md bg-white px-2 py-1 hover:bg-primary/10">Admin</button>
          </div>
          <div className="mt-2">Password: <code>password123</code></div>
        </div>
      </Card>
    </div>
  );
}
