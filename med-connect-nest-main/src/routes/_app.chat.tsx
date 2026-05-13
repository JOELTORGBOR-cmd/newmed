import { createFileRoute, Navigate, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PresenceDot } from "@/components/chat/PresenceDot";
import { usePresence } from "@/hooks/usePresence";
import { Send, Paperclip, Volume2, VolumeX, Search } from "lucide-react";
import { isSoundEnabled, playPing, setSoundEnabled } from "@/lib/chat-sound";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/chat")({
  validateSearch: (s: Record<string, unknown>) => ({ u: typeof s.u === "string" ? s.u : undefined }),
  component: ChatPage,
});

type StaffUser = { id: string; full_name: string; role: AppRole };
type Msg = {
  id: string; conversation_id: string; sender_id: string; body: string | null;
  attachment_url: string | null; created_at: string; status: string; deleted_for_sender: boolean;
};

const ROLES: AppRole[] = ["doctor", "nurse", "receptionist", "pharmacist", "lab_technician", "admin", "accountant"];

function ChatPage() {
  const { user, isStaff, loading } = useAuth();
  usePresence();
  const { u: selectedId } = useSearch({ from: "/_app/chat" });
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sound, setSound] = useState(isSoundEnabled());
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load staff list
  useEffect(() => {
    if (!user || !isStaff) return;
    (async () => {
      const { data: ur } = await supabase.from("user_roles").select("user_id, role").neq("role", "patient");
      const ids = [...new Set((ur ?? []).map((r) => r.user_id))].filter((id) => id !== user.id);
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, full_name").in("id", ids)
        : { data: [] as any[] };
      const pmap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name || "Staff"]));
      // pick first role per user
      const rolePerUser = new Map<string, AppRole>();
      (ur ?? []).forEach((r: any) => { if (!rolePerUser.has(r.user_id)) rolePerUser.set(r.user_id, r.role); });
      setStaff(ids.map((id) => ({ id, full_name: pmap.get(id) ?? "Staff", role: rolePerUser.get(id) ?? "staff" })));
    })();
  }, [user, isStaff]);

  // Presence subscription
  useEffect(() => {
    if (!isStaff) return;
    const load = async () => {
      const { data } = await supabase.from("staff_presence").select("user_id, status, last_seen");
      const cutoff = Date.now() - 90_000;
      const map: Record<string, boolean> = {};
      (data ?? []).forEach((p: any) => {
        map[p.user_id] = p.status === "online" && new Date(p.last_seen).getTime() > cutoff;
      });
      setPresence(map);
    };
    load();
    const ch = supabase.channel("presence-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_presence" }, load)
      .subscribe();
    const iv = setInterval(load, 30000);
    return () => { supabase.removeChannel(ch); clearInterval(iv); };
  }, [isStaff]);

  // Open / create conversation when selectedId changes
  useEffect(() => {
    if (!user || !selectedId) { setConversationId(null); setMessages([]); return; }
    (async () => {
      const [a, b] = [user.id, selectedId].sort();
      let { data: conv } = await supabase
        .from("staff_conversations").select("id").eq("user_a", a).eq("user_b", b).maybeSingle();
      if (!conv) {
        const { data: created, error } = await supabase
          .from("staff_conversations").insert({ user_a: a, user_b: b }).select("id").single();
        if (error) { toast.error(error.message); return; }
        conv = created;
      }
      setConversationId(conv!.id);
    })();
  }, [user, selectedId]);

  // Load + subscribe messages
  useEffect(() => {
    if (!conversationId || !user) return;
    let firstLoad = true;
    const load = async () => {
      const { data } = await supabase
        .from("staff_messages").select("*")
        .eq("conversation_id", conversationId).order("created_at", { ascending: true });
      const msgs = (data ?? []) as Msg[];
      setMessages(msgs);
      // mark unread (others') as read
      const unread = msgs.filter((m) => m.sender_id !== user.id && m.status !== "read").map((m) => m.id);
      if (unread.length) {
        await supabase.from("staff_messages")
          .update({ status: "read", read_at: new Date().toISOString() })
          .in("id", unread);
      }
      firstLoad = false;
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
    };
    load();
    const ch = supabase
      .channel(`conv-${conversationId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "staff_messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as Msg;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          if (!firstLoad && m.sender_id !== user.id) playPing();
          requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, user]);

  const send = async (body?: string, attachment_url?: string) => {
    if (!conversationId || !user) return;
    const text = (body ?? draft).trim();
    if (!text && !attachment_url) return;
    const { error } = await supabase.from("staff_messages").insert({
      conversation_id: conversationId, sender_id: user.id, body: text || null, attachment_url: attachment_url || null,
    });
    if (error) { toast.error(error.message); return; }
    setDraft("");
  };

  const onFile = async (f: File) => {
    if (!user) return;
    const path = `private/${user.id}/${Date.now()}-${f.name}`;
    const { error } = await supabase.storage.from("chat-attachments").upload(path, f);
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("chat-attachments").getPublicUrl(path);
    await send("", data.publicUrl);
  };

  const filtered = useMemo(() => {
    return staff.filter((s) =>
      (roleFilter === "all" || s.role === roleFilter) &&
      s.full_name.toLowerCase().includes(search.toLowerCase())
    );
  }, [staff, search, roleFilter]);

  const selected = staff.find((s) => s.id === selectedId);

  if (loading) return null;
  if (!isStaff) return <Navigate to="/dashboard" />;

  return (
    <div className="grid h-[calc(100vh-7rem)] grid-cols-1 gap-3 md:grid-cols-[320px_1fr]">
      {/* Sidebar */}
      <div className="rounded-lg border bg-card p-3 flex flex-col">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-semibold">Chat Only Me</h2>
          <Button size="icon" variant="ghost" onClick={() => { setSoundEnabled(!sound); setSound(!sound); }}>
            {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
        </div>
        <div className="relative mb-2">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff..." className="pl-8" />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="mb-2"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {ROLES.map((r) => <SelectItem key={r} value={r}>{r.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <ScrollArea className="flex-1 -mx-1">
          <div className="space-y-1 px-1">
            {filtered.map((s) => (
              <Link key={s.id} to="/chat" search={{ u: s.id }}
                className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent ${selectedId === s.id ? "bg-accent" : ""}`}>
                <div className="relative">
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                    {s.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5"><PresenceDot online={!!presence[s.id]} /></span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{s.full_name}</div>
                  <div className="text-xs text-muted-foreground capitalize">{s.role.replace("_", " ")}</div>
                </div>
              </Link>
            ))}
            {filtered.length === 0 && <div className="p-4 text-center text-xs text-muted-foreground">No staff found</div>}
          </div>
        </ScrollArea>
      </div>

      {/* Thread */}
      <div className="rounded-lg border bg-card flex flex-col">
        {!selected ? (
          <div className="flex-1 grid place-items-center text-sm text-muted-foreground">Select a staff member to start chatting.</div>
        ) : (
          <>
            <div className="border-b px-4 py-3 flex items-center gap-2">
              <PresenceDot online={!!presence[selected.id]} />
              <div>
                <div className="font-semibold">{selected.full_name}</div>
                <div className="text-xs text-muted-foreground capitalize">{selected.role.replace("_", " ")} · {presence[selected.id] ? "online" : "offline"}</div>
              </div>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
              {messages.filter((m) => !(m.deleted_for_sender && m.sender_id === user!.id)).map((m) => {
                const mine = m.sender_id === user!.id;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                      {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
                      {m.attachment_url && (
                        <a href={m.attachment_url} target="_blank" rel="noreferrer" className="underline text-xs">Attachment</a>
                      )}
                      <div className={`mt-1 text-[10px] ${mine ? "opacity-80" : "text-muted-foreground"}`}>
                        {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {mine && <span className="ml-1">· {m.status}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); send(); }} className="border-t p-3 flex items-center gap-2">
              <input ref={fileRef} type="file" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
              <Button type="button" size="icon" variant="ghost" onClick={() => fileRef.current?.click()}>
                <Paperclip className="h-4 w-4" />
              </Button>
              <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type a message... 😊" />
              <Button type="submit" size="icon"><Send className="h-4 w-4" /></Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
