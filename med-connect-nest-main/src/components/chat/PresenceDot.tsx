export function PresenceDot({ online }: { online: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ring-2 ring-background ${
        online ? "bg-emerald-500" : "bg-muted-foreground/40"
      }`}
      aria-label={online ? "online" : "offline"}
    />
  );
}
