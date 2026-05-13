import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: "bg-success text-success-foreground",
    confirmed: "bg-success text-success-foreground",
    completed: "bg-success text-success-foreground",
    success: "bg-success text-success-foreground",
    pending: "bg-warning text-warning-foreground",
    pending_verification: "bg-amber-500 text-white",
    awaiting_payment: "bg-warning text-warning-foreground",
    overdue: "bg-destructive text-destructive-foreground",
    cancelled: "bg-destructive/80 text-destructive-foreground",
  };
  const labels: Record<string, string> = {
    pending_verification: "Pending verification",
    awaiting_payment: "Awaiting payment",
  };
  return <Badge className={cn("capitalize", map[status] ?? "bg-secondary text-secondary-foreground")}>{labels[status] ?? status}</Badge>;
}
