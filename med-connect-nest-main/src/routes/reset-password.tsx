import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [hasRecovery, setHasRecovery] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash.includes("type=recovery")) {
      setHasRecovery(true);
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    navigate({ to: "/login" });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-muted px-4">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-2xl font-bold">Reset password</h1>
        {!hasRecovery ? (
          <p className="mt-2 text-sm text-muted-foreground">Open the recovery link from your email to reset your password.</p>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div><Label>New password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={100} /></div>
            <Button type="submit" className="w-full">Update password</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
