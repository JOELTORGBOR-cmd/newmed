import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pin, PinOff, Send, Paperclip, Smile, Reply, Volume2, VolumeX, MicOff } from "lucide-react";
import { isSoundEnabled, playPing, setSoundEnabled } from "@/lib/chat-sound";
import { toast } from "sonner";
import { usePresence } from "@/hooks/usePresence";

export const Route = createFileRoute("/_app/found-family")({
  component: FoundFamily,
});

type GMsg = {
  id: string; sender_id: string; body: string | null; attachment_url: string | null;
  reply_to: string | null; pinned: boolean; created_at: string;
};
type Reaction = { message_id: string; user_id: string; emoji: string };

const EMOJIS = ["👍", "❤️", "🎉", "😂", "🙏", "🔥"];

function FoundFamily() {
  const { user, isStaff, isAdmin, loading } = useAuth();
  usePresence();
  const [messages, setMessages] = useState<GMsg[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<GMsg | null>(null);
  const [muted, setMuted] = useState(false);
  const [sound, setSound] = useState(isSoundEnabled());
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load
  useEffect(() => {
    if (!isStaff || !user) return;
    let firstLoad = true;
    const load = async () => {
      const [{ data: msgs }, { data: rxs }, { data: muteRow }] = await Promise.all([
        supabase.from("staff_group_messages").select("*").order("created_at", { ascending: true }).limit(500),
        supabase.from("staff_group_reactions").select("*"),
        supabase.from("staff_group_mutes").select("muted_until").eq("user_id", user.id).maybeSingle(),
      ]);
      const m = (msgs ?? []) as GMsg[];
      setMessages(m);
      setReactions((rxs ?? []) as Reaction[]);
      setMuted(!!muteRow && new Date(muteRow.muted_until) > new Date());
      const ids = [...new Set(m.map((x) => x.sender_id))];
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        setProfiles(Object.fromEntries((profs ?? []).map((p: any) => [p.id, p.full_name || "Staff"])));
      }
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
      firstLoad = false;
    };
    load();
    const ch = supabase
      .channel("found-family")
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_group_messages" }, (p) => {
        if (p.eventType === "INSERT") {
          const nm = p.new as GMsg;
          setMessages((prev) => prev.some((x) => x.id === nm.id) ? prev : [...prev, nm]);
          if (!firstLoad && nm.sender_id !== user.id) playPing();
          requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
        } else if (p.eventType === "UPDATE") {
          setMessages((prev) => prev.map((m) => m.id === (p.new as GMsg).id ? (p.new as GMsg) : m));
        } else if (p.eventType === "DELETE") {
          setMessages((prev) => prev.filter((m) => m.id !== (p.old as any).id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_group_reactions" }, async () => {
        const { data } = await supabase.from("staff_group_reactions").select("*");
        setReactions((data ?? []) as Reaction[]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isStaff, user]);

  const send = async () => {
    if (!user) return;
    const text = draft.trim();
    if (!text) return;
    const { error } = await supabase.from("staff_group_messages").insert({
      sender_id: user.id, body: text, reply_to: replyTo?.id ?? null,
    });
    if (error) {
      toast.error(error.message.includes("policy") ? "You are temporarily muted." : error.message);
      return;
    }
    setDraft(""); setReplyTo(null);
  };

  const onFile = async (f: File) => {
    if (!user) return;
    const path = `group/${Date.now()}-${f.name}`;
    const { error } = await supabase.storage.from("chat-attachments").upload(path, f);
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("chat-attachments").getPublicUrl(path);
    await supabase.from("staff_group_messages").insert({ sender_id: user.id, body: null, attachment_url: data.publicUrl });
  };

  const react = async (mid: string, emoji: string) => {
    if (!user) return;
    const exists = reactions.find((r) => r.message_id === mid && r.user_id === user.id && r.emoji === emoji);
    if (exists) {
      await supabase.from("staff_group_reactions").delete()
        .eq("message_id", mid).eq("user_id", user.id).eq("emoji", emoji);
    } else {
      await supabase.from("staff_group_reactions").insert({ message_id: mid, user_id: user.id, emoji });
    }
  };

  const togglePin = async (m: GMsg) => {
    await supabase.from("staff_group_messages").update({ pinned: !m.pinned }).eq("id", m.id);
  };

  const muteUser = async (uid: string) => {
    const until = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from("staff_group_mutes").upsert({ user_id: uid, muted_until: until, muted_by: user?.id });
    if (error) toast.error(error.message); else toast.success("Muted for 1 hour");
  };

  const pinned = useMemo(() => messages.find((m) => m.pinned), [messages]);
  const reactionsByMsg = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    reactions.forEach((r) => {
      if (!map.has(r.message_id)) map.set(r.message_id, {});
      map.get(r.message_id)![r.emoji] = (map.get(r.message_id)![r.emoji] ?? 0) + 1;
    });
    return map;
  }, [reactions]);

  const renderBody = (text: string) =>
    text.split(/(\s+)/).map((tok, i) =>
      tok.startsWith("@") ? <span key={i} className="font-semibold text-primary">{tok}</span> : <span key={i}>{tok}</span>
    );

  if (loading) return null;
  if (!isStaff) return <Navigate to="/dashboard" />;

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-4xl flex-col rounded-lg border bg-card">
      <div className="border-b px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-semibold">Found Family</h1>
          <p className="text-xs text-muted-foreground">Welcome to Found Family — Staff Community Room</p>
        </div>
        <div className="flex items-center gap-2">
          {muted && <Badge variant="destructive">You are muted</Badge>}
          <Button size="icon" variant="ghost" onClick={() => { setSoundEnabled(!sound); setSound(!sound); }}>
            {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {pinned && (
        <div className="border-b bg-amber-50 dark:bg-amber-950/30 px-4 py-2 text-xs flex items-center gap-2">
          <Pin className="h-3.5 w-3.5" />
          <span className="font-semibold">Pinned:</span>
          <span className="truncate">{pinned.body}</span>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m) => {
          const mine = m.sender_id === user!.id;
          const replyMsg = m.reply_to ? messages.find((x) => x.id === m.reply_to) : null;
          const rx = reactionsByMsg.get(m.id);
          return (
            <div key={m.id} className={`group flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {!mine && <div className="text-xs font-semibold opacity-80">{profiles[m.sender_id] ?? "Staff"}</div>}
                {replyMsg && (
                  <div className={`mb-1 rounded px-2 py-1 text-xs ${mine ? "bg-primary-foreground/20" : "bg-background"}`}>
                    <Reply className="inline h-3 w-3 mr-1" />
                    <span className="opacity-80">{(replyMsg.body ?? "attachment").slice(0, 60)}</span>
                  </div>
                )}
                {m.body && <div className="whitespace-pre-wrap break-words">{renderBody(m.body)}</div>}
                {m.attachment_url && (
                  <a href={m.attachment_url} target="_blank" rel="noreferrer" className="underline text-xs">Attachment</a>
                )}
                <div className="mt-1 flex items-center gap-1 flex-wrap">
                  {rx && Object.entries(rx).map(([e, n]) => (
                    <button key={e} onClick={() => react(m.id, e)}
                      className={`text-[11px] rounded-full px-1.5 py-0.5 ${mine ? "bg-primary-foreground/20" : "bg-background"}`}>
                      {e} {n}
                    </button>
                  ))}
                </div>
                <div className={`mt-1 flex items-center gap-2 text-[10px] ${mine ? "opacity-80" : "text-muted-foreground"}`}>
                  <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <button className="opacity-0 group-hover:opacity-100" onClick={() => setReplyTo(m)}>Reply</button>
                  {EMOJIS.slice(0, 3).map((e) => (
                    <button key={e} className="opacity-0 group-hover:opacity-100" onClick={() => react(m.id, e)}>{e}</button>
                  ))}
                  {isAdmin && (
                    <>
                      <button className="opacity-0 group-hover:opacity-100" onClick={() => togglePin(m)}>
                        {m.pinned ? <PinOff className="inline h-3 w-3" /> : <Pin className="inline h-3 w-3" />}
                      </button>
                      {!mine && (
                        <button className="opacity-0 group-hover:opacity-100" onClick={() => muteUser(m.sender_id)} title="Mute 1h">
                          <MicOff className="inline h-3 w-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {replyTo && (
        <div className="border-t px-4 py-2 text-xs bg-muted flex items-center justify-between">
          <span>Replying to: {(replyTo.body ?? "attachment").slice(0, 80)}</span>
          <button onClick={() => setReplyTo(null)} className="underline">cancel</button>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="border-t p-3 flex items-center gap-2">
        <input ref={fileRef} type="file" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <Button type="button" size="icon" variant="ghost" onClick={() => fileRef.current?.click()}>
          <Paperclip className="h-4 w-4" />
        </Button>
        <div className="relative flex-1">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={muted ? "You are temporarily muted" : "Message Found Family... use @name to mention"} disabled={muted} />
        </div>
        <details className="relative">
          <summary className="list-none cursor-pointer p-2"><Smile className="h-4 w-4" /></summary>
          <div className="absolute bottom-full right-0 mb-2 rounded border bg-popover p-2 shadow flex gap-1">
            {EMOJIS.map((e) => (
              <button key={e} type="button" onClick={() => setDraft((d) => d + e)} className="text-lg">{e}</button>
            ))}
          </div>
        </details>
        <Button type="submit" size="icon" disabled={muted}><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}
