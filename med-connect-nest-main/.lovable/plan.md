
# Internal Communication & Reminders System

Three features built on Supabase realtime + RLS. No external SMS/email provider — structures are ready and an in-app notification is delivered now.

## 1. Database (single migration)

### Reminders
- `appointment_reminders`
  - `appointment_id`, `patient_id`, `sent_by` (staff uid), `channel` (`in_app|sms|email`), `status` (`pending|sent|failed`), `message`, `sent_at`, `created_at`
  - UNIQUE `(appointment_id, channel, date(created_at))` → prevents duplicates same day
  - RLS: staff insert/select; patient can read their own
- Trigger on insert (in_app channel): write to `notifications` for the patient role

### Private chat
- `staff_conversations` — `id`, `user_a uuid`, `user_b uuid`, `last_message_at`, UNIQUE pair (`least(a,b), greatest(a,b)`)
- `staff_messages` — `id`, `conversation_id`, `sender_id`, `body text`, `attachment_url`, `status` (`sent|delivered|read`), `read_at`, `deleted_for_sender bool`, `created_at`
- `staff_presence` — `user_id PK`, `status` (`online|offline`), `last_seen`, `typing_in_conversation uuid null`
- RLS: only `user_a` or `user_b` can SELECT/INSERT messages in conversation. Admin explicitly excluded (no admin override policy). Service role bypasses but never used from client.

### Group chat (Found Family)
- `staff_group_messages` — `id`, `sender_id`, `body`, `attachment_url`, `reply_to uuid`, `pinned bool`, `created_at`
- `staff_group_reactions` — `message_id`, `user_id`, `emoji`, PK(message_id,user_id,emoji)
- `staff_group_mutes` — `user_id PK`, `muted_until timestamptz`, `muted_by`
- RLS: SELECT/INSERT only for `is_staff(auth.uid())`. INSERT blocked if currently muted. Pin update only by admin.

### Realtime
- ALTER PUBLICATION supabase_realtime ADD all 6 tables.

## 2. Frontend

### Routes
- `src/routes/_app.reminders.tsx` — receptionist tomorrow's appointments list, "Send Reminder" per row + "Send to all" bulk button. Shows status badge.
- `src/routes/_app.chat.tsx` — layout with sidebar (staff list w/ search + role filter, presence dot, unread badge) and chat pane. URL `?u=<userId>` selects conversation.
- `src/routes/_app.found-family.tsx` — group room. Header with pinned message, message list with reactions/replies/mentions, composer with emoji + file upload to existing `lab-results` bucket subfolder OR new `chat-attachments` bucket (create in migration, public read for staff).

### Sidebar additions (`AppSidebar.tsx`)
- "Reminders" → receptionist + admin
- "Staff Chat" → all staff
- "Found Family" → all staff
- Patients role: none of these visible

### Components
- `ChatSidebar.tsx`, `ChatThread.tsx`, `ChatComposer.tsx`, `GroupRoom.tsx`, `PresenceDot.tsx`
- Hook `usePresence()` upserts `staff_presence` on mount + heartbeat every 30s, sets offline on unmount via beforeunload + visibility change

### Notifications
- `NotificationBell` already exists — reuse. Add unread chat counter via realtime subscription on `staff_messages` where `sender_id != me`.

### Reminder logic
- Server-side via `createServerFn` is overkill; do it client-side from receptionist with RLS:
  - Query `appointments` where `scheduled_at::date = current_date + 1`
  - For each: insert into `appointment_reminders` with channel `in_app` → trigger fires → patient gets notification + (future) SMS/email row stays as `pending` for worker
  - Show toast with success count, errors surfaced

### Privacy
- Private chat queries always filter `conversation_id` checked against RLS; no admin policy
- Group chat: muted users get clear error when their insert is blocked (raise exception in trigger)

## 3. UI/UX
- WhatsApp-style: list left, thread right, sticky composer
- Dark mode via existing tokens
- Mobile: collapse sidebar on `<md`, toggle button
- Sound toggle stored in `localStorage`, plays short beep (data URI) on incoming message when enabled

## 4. Out of scope (noted to user)
- Real SMS/email delivery requires Twilio/Resend — schema is ready, swap-in a queue worker later
- True E2E encryption (key exchange) — using RLS-enforced privacy instead, which is the standard Supabase approach

## Files
- 1 migration (tables, RLS, triggers, realtime publication, chat-attachments bucket)
- `src/routes/_app.reminders.tsx`, `_app.chat.tsx`, `_app.found-family.tsx`
- `src/components/chat/*` (ChatSidebar, ChatThread, ChatComposer, GroupRoom, PresenceDot)
- `src/hooks/usePresence.ts`, `src/hooks/useUnreadChats.ts`
- `src/components/AppSidebar.tsx` (add 3 links)
- `src/components/NotificationBell.tsx` (add chat unread badge)
