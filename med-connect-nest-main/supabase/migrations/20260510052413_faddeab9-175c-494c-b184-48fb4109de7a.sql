
-- 3. Refresh is_staff to include new roles
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles
    WHERE user_id=_user_id
    AND role IN ('staff','admin','doctor','nurse','lab_technician','pharmacist','receptionist','accountant'))
$$;

CREATE OR REPLACE FUNCTION public.is_pharmacist(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role='pharmacist') $$;

CREATE OR REPLACE FUNCTION public.is_receptionist(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role='receptionist') $$;

CREATE OR REPLACE FUNCTION public.is_accountant(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role='accountant') $$;

-- 4. Receptionist + accountant invoice/appointment access (is_staff already covers most)
CREATE POLICY "receptionist update appts" ON public.appointments FOR UPDATE
  USING (public.is_receptionist(auth.uid())) WITH CHECK (public.is_receptionist(auth.uid()));

-- 5. Notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_role public.app_role NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see notifications for their roles" ON public.notifications FOR SELECT
  USING (EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.role=notifications.recipient_role));
CREATE POLICY "users mark their notifications read" ON public.notifications FOR UPDATE
  USING (EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.role=notifications.recipient_role))
  WITH CHECK (EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.role=notifications.recipient_role));
CREATE POLICY "admin manage notifications" ON public.notifications FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_notifications_role_unread ON public.notifications(recipient_role) WHERE read_at IS NULL;

-- 6. Activity logs (audit)
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT NOT NULL,
  patient_id UUID,
  record_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read activity logs" ON public.activity_logs FOR SELECT
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "auth users insert activity logs" ON public.activity_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE INDEX idx_activity_logs_record ON public.activity_logs(record_id);
CREATE INDEX idx_activity_logs_patient ON public.activity_logs(patient_id);

-- 7. Low-stock notification trigger
CREATE OR REPLACE FUNCTION public.fn_notify_low_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.stock < 50 AND (OLD.stock IS NULL OR OLD.stock >= 50) THEN
    INSERT INTO public.notifications (recipient_role, title, body, link)
    VALUES ('admin', 'Low stock: ' || NEW.name,
            'Stock dropped to ' || NEW.stock || ' units. Consider restocking.',
            '/inventory');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_low_stock ON public.drugs;
CREATE TRIGGER trg_notify_low_stock AFTER UPDATE OF stock ON public.drugs
  FOR EACH ROW EXECUTE FUNCTION public.fn_notify_low_stock();

-- 8. Audit trigger for medical record edits
CREATE OR REPLACE FUNCTION public.fn_log_record_edit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.activity_logs (user_id, action, patient_id, record_id)
  VALUES (auth.uid(), 'edit_record', NEW.patient_id, NEW.id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_log_record_edit ON public.medical_records;
CREATE TRIGGER trg_log_record_edit AFTER UPDATE ON public.medical_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_record_edit();
