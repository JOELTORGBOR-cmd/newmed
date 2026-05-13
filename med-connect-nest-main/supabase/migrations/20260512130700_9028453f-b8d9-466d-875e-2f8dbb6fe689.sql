
-- =========================================
-- APPOINTMENT REMINDERS
-- =========================================
CREATE TABLE IF NOT EXISTS public.appointment_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  sent_by uuid,
  channel text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app','sms','email')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  message text,
  sent_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_on date GENERATED ALWAYS AS ((created_at AT TIME ZONE 'UTC')::date) STORED
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_reminder_per_day
  ON public.appointment_reminders (appointment_id, channel, created_on);

ALTER TABLE public.appointment_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff manage reminders" ON public.appointment_reminders
  FOR ALL USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "patient view own reminders" ON public.appointment_reminders
  FOR SELECT USING (auth.uid() = patient_id);

CREATE OR REPLACE FUNCTION public.fn_deliver_reminder()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.channel = 'in_app' THEN
    INSERT INTO public.notifications (recipient_role, title, body, link)
    VALUES ('patient', 'Appointment reminder',
            COALESCE(NEW.message, 'You have an appointment tomorrow.'),
            '/appointments');
    NEW.status := 'sent';
    NEW.sent_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_deliver_reminder ON public.appointment_reminders;
CREATE TRIGGER trg_deliver_reminder
  BEFORE INSERT ON public.appointment_reminders
  FOR EACH ROW EXECUTE FUNCTION public.fn_deliver_reminder();

-- =========================================
-- PRIVATE STAFF CHAT
-- =========================================
CREATE TABLE IF NOT EXISTS public.staff_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL,
  user_b uuid NOT NULL,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_conv_pair_unique UNIQUE (user_a, user_b),
  CONSTRAINT staff_conv_ordered CHECK (user_a < user_b)
);

CREATE TABLE IF NOT EXISTS public.staff_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.staff_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  body text,
  attachment_url text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','delivered','read')),
  read_at timestamptz,
  deleted_for_sender boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_messages_conv ON public.staff_messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS public.staff_presence (
  user_id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'offline' CHECK (status IN ('online','offline')),
  typing_in_conversation uuid,
  last_seen timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participants read conv" ON public.staff_conversations
  FOR SELECT USING (auth.uid() = user_a OR auth.uid() = user_b);
CREATE POLICY "staff create conv" ON public.staff_conversations
  FOR INSERT WITH CHECK (
    is_staff(auth.uid()) AND (auth.uid() = user_a OR auth.uid() = user_b)
  );
CREATE POLICY "participants update conv" ON public.staff_conversations
  FOR UPDATE USING (auth.uid() = user_a OR auth.uid() = user_b)
  WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "participants read msg" ON public.staff_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.staff_conversations c
            WHERE c.id = conversation_id
              AND (auth.uid() = c.user_a OR auth.uid() = c.user_b))
  );
CREATE POLICY "participants send msg" ON public.staff_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (SELECT 1 FROM public.staff_conversations c
            WHERE c.id = conversation_id
              AND (auth.uid() = c.user_a OR auth.uid() = c.user_b))
  );
CREATE POLICY "participants update msg" ON public.staff_messages
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.staff_conversations c
            WHERE c.id = conversation_id
              AND (auth.uid() = c.user_a OR auth.uid() = c.user_b))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.staff_conversations c
            WHERE c.id = conversation_id
              AND (auth.uid() = c.user_a OR auth.uid() = c.user_b))
  );

CREATE POLICY "staff read presence" ON public.staff_presence
  FOR SELECT USING (is_staff(auth.uid()));
CREATE POLICY "user upsert own presence" ON public.staff_presence
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user update own presence" ON public.staff_presence
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.fn_bump_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.staff_conversations
    SET last_message_at = NEW.created_at
    WHERE id = NEW.conversation_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_bump_conv ON public.staff_messages;
CREATE TRIGGER trg_bump_conv AFTER INSERT ON public.staff_messages
  FOR EACH ROW EXECUTE FUNCTION public.fn_bump_conversation();

-- =========================================
-- FOUND FAMILY GROUP CHAT
-- =========================================
CREATE TABLE IF NOT EXISTS public.staff_group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  body text,
  attachment_url text,
  reply_to uuid REFERENCES public.staff_group_messages(id) ON DELETE SET NULL,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_group_msg_created ON public.staff_group_messages (created_at);

CREATE TABLE IF NOT EXISTS public.staff_group_reactions (
  message_id uuid NOT NULL REFERENCES public.staff_group_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS public.staff_group_mutes (
  user_id uuid PRIMARY KEY,
  muted_until timestamptz NOT NULL,
  muted_by uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_group_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_group_mutes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read group" ON public.staff_group_messages
  FOR SELECT USING (is_staff(auth.uid()));
CREATE POLICY "staff post group" ON public.staff_group_messages
  FOR INSERT WITH CHECK (
    is_staff(auth.uid()) AND sender_id = auth.uid() AND
    NOT EXISTS (SELECT 1 FROM public.staff_group_mutes m
                WHERE m.user_id = auth.uid() AND m.muted_until > now())
  );
CREATE POLICY "admin pin group" ON public.staff_group_messages
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "staff read reactions" ON public.staff_group_reactions
  FOR SELECT USING (is_staff(auth.uid()));
CREATE POLICY "staff add reaction" ON public.staff_group_reactions
  FOR INSERT WITH CHECK (is_staff(auth.uid()) AND user_id = auth.uid());
CREATE POLICY "staff remove own reaction" ON public.staff_group_reactions
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "staff read mutes" ON public.staff_group_mutes
  FOR SELECT USING (is_staff(auth.uid()));
CREATE POLICY "admin manage mutes" ON public.staff_group_mutes
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth read chat-attachments" ON storage.objects
  FOR SELECT USING (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);
CREATE POLICY "staff upload chat-attachments" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'chat-attachments' AND is_staff(auth.uid()));
CREATE POLICY "owner delete chat-attachments" ON storage.objects
  FOR DELETE USING (bucket_id = 'chat-attachments' AND owner = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.appointment_reminders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_presence;
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_group_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_group_reactions;
