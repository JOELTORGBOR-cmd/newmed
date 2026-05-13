import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { FlaskConical, Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/lab-results")({
  component: LabResultsPage,
});

function LabResultsPage() {
  const { user, isStaff } = useAuth();
  const [labs, setLabs] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    let q = supabase.from("lab_results").select("*").order("created_at", { ascending: false });
    if (!isStaff) q = q.eq("patient_id", user.id);
    q.then(({ data }) => setLabs(data ?? []));
  }, [user, isStaff]);

  const download = async (path: string | null) => {
    if (!path) return toast.info("No file attached");
    const { data, error } = await supabase.storage.from("lab-results").createSignedUrl(path, 60);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Lab results</h1><p className="text-sm text-muted-foreground">Test results and downloadable reports.</p></div>
      <Card className="divide-y">
        {labs.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No lab results yet.</div>}
        {labs.map((l) => (
          <div key={l.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary/10 text-secondary"><FlaskConical className="h-5 w-5" /></div>
              <div>
                <div className="font-semibold">{l.test_name}</div>
                <div className="text-sm text-muted-foreground">{new Date(l.created_at).toLocaleDateString()}</div>
                {l.result_summary && <div className="mt-1 text-sm">{l.result_summary}</div>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={l.status} />
              {l.file_path && <Button size="sm" variant="outline" onClick={() => download(l.file_path)}><Download className="mr-1 h-4 w-4" />Download</Button>}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
