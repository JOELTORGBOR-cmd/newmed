import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Star, Stethoscope } from "lucide-react";
import { doctorName } from "@/lib/utils";

export const Route = createFileRoute("/_app/doctors")({
  component: DoctorsPage,
});

type Doctor = {
  id: string;
  full_name: string;
  specialty: string;
  bio: string | null;
  rating: number | null;
  consultation_fee: number | null;
  avatar_url: string | null;
};

function DoctorsPage() {
  const [docs, setDocs] = useState<Doctor[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("doctors")
        .select("id, full_name, specialty, bio, rating, consultation_fee, avatar_url")
        .eq("status", "active")
        .order("rating", { ascending: false });
      setDocs((data as Doctor[]) ?? []);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Our doctors</h1>
        <p className="text-sm text-muted-foreground">Browse specialists and book a visit.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {docs.length === 0 && (
          <p className="text-sm text-muted-foreground">No doctors available yet.</p>
        )}
        {docs.map((d) => (
          <Card key={d.id} className="p-5">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
                <Stethoscope className="h-6 w-6" />
              </div>
              <div>
                <div className="font-semibold">{doctorName(d.full_name)}</div>
                <div className="text-xs text-secondary font-medium">{d.specialty}</div>
              </div>
            </div>
            {d.bio && <p className="mt-3 text-sm text-muted-foreground line-clamp-3">{d.bio}</p>}
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="flex items-center gap-1 text-warning">
                <Star className="h-4 w-4 fill-current" />
                {d.rating?.toFixed(1) ?? "—"}
              </span>
              <span className="font-semibold">GHS {Number(d.consultation_fee ?? 0).toFixed(2)}</span>
            </div>
            <Button asChild className="mt-4 w-full">
              <Link to="/appointments">Book appointment</Link>
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
