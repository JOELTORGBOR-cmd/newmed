
-- 1) Lab workflow: auto-invoice on insert, default status, release on payment
CREATE OR REPLACE FUNCTION public.fn_lab_default_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS NULL OR NEW.status = 'pending' THEN
    NEW.status := 'awaiting_payment';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lab_default_status ON public.lab_requests;
CREATE TRIGGER trg_lab_default_status
BEFORE INSERT ON public.lab_requests
FOR EACH ROW EXECUTE FUNCTION public.fn_lab_default_status();

CREATE OR REPLACE FUNCTION public.fn_lab_request_to_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv_id uuid;
BEGIN
  IF NEW.appointment_id IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO inv_id FROM public.invoices WHERE appointment_id = NEW.appointment_id;
  IF inv_id IS NULL THEN
    INSERT INTO public.invoices (patient_id, appointment_id, description, lab_cost, subtotal, amount, status)
    VALUES (NEW.patient_id, NEW.appointment_id, 'Lab tests', COALESCE(NEW.test_fee,0), COALESCE(NEW.test_fee,0), COALESCE(NEW.test_fee,0), 'pending')
    RETURNING id INTO inv_id;
  ELSE
    UPDATE public.invoices SET lab_cost = COALESCE(lab_cost,0) + COALESCE(NEW.test_fee,0) WHERE id = inv_id;
  END IF;
  PERFORM public.fn_recalc_invoice(inv_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lab_request_to_invoice ON public.lab_requests;
CREATE TRIGGER trg_lab_request_to_invoice
AFTER INSERT ON public.lab_requests
FOR EACH ROW EXECUTE FUNCTION public.fn_lab_request_to_invoice();

CREATE OR REPLACE FUNCTION public.fn_invoice_paid_release_labs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' AND NEW.appointment_id IS NOT NULL THEN
    UPDATE public.lab_requests
      SET status = 'pending'
      WHERE appointment_id = NEW.appointment_id AND status = 'awaiting_payment';
    INSERT INTO public.notifications (recipient_role, title, body, link)
    VALUES ('lab_technician', 'Lab tests ready', 'Payment received. Linked tests are now ready for processing.', '/lab-requests');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoice_paid_release_labs ON public.invoices;
CREATE TRIGGER trg_invoice_paid_release_labs
AFTER UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.fn_invoice_paid_release_labs();

-- 2) Doctor cross-patient view (referral / emergency). Audit handled in app.
DROP POLICY IF EXISTS "doctor view any medical record" ON public.medical_records;
CREATE POLICY "doctor view any medical record" ON public.medical_records
FOR SELECT USING (has_role(auth.uid(), 'doctor'::app_role));

DROP POLICY IF EXISTS "doctor view any lab result" ON public.lab_results;
CREATE POLICY "doctor view any lab result" ON public.lab_results
FOR SELECT USING (has_role(auth.uid(), 'doctor'::app_role));

DROP POLICY IF EXISTS "doctor view any vitals" ON public.vitals;
CREATE POLICY "doctor view any vitals" ON public.vitals
FOR SELECT USING (has_role(auth.uid(), 'doctor'::app_role));

DROP POLICY IF EXISTS "doctor view any allergy" ON public.allergies;
CREATE POLICY "doctor view any allergy" ON public.allergies
FOR SELECT USING (has_role(auth.uid(), 'doctor'::app_role));

DROP POLICY IF EXISTS "doctor view any prescription" ON public.prescriptions;
CREATE POLICY "doctor view any prescription" ON public.prescriptions
FOR SELECT USING (has_role(auth.uid(), 'doctor'::app_role));

-- 3) Patient lookup by email (RPC, safe – doctors/admins only)
CREATE OR REPLACE FUNCTION public.find_patient_by_email(_email text)
RETURNS TABLE (id uuid, full_name text, email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (has_role(auth.uid(),'doctor'::app_role) OR has_role(auth.uid(),'admin'::app_role)) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT p.id, p.full_name, u.email::text
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    JOIN public.user_roles ur ON ur.user_id = u.id AND ur.role = 'patient'::app_role
    WHERE lower(u.email) = lower(_email)
    LIMIT 1;
END $$;
