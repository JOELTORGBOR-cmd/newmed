
-- 1. Receptionist SELECT policy on appointments
DROP POLICY IF EXISTS "receptionist view appointments" ON public.appointments;
CREATE POLICY "receptionist view appointments"
  ON public.appointments FOR SELECT
  USING (public.is_receptionist(auth.uid()));

-- 2. New appt status
ALTER TYPE public.appt_status ADD VALUE IF NOT EXISTS 'awaiting_payment';

-- 3. Trigger: on check-in, create/update consultation invoice
CREATE OR REPLACE FUNCTION public.fn_invoice_on_checkin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  fee numeric := 0;
  inv_id uuid;
BEGIN
  IF NEW.checked_in_at IS NOT NULL AND OLD.checked_in_at IS NULL THEN
    IF NEW.doctor_id IS NOT NULL THEN
      SELECT COALESCE(consultation_fee, 0) INTO fee FROM public.doctors WHERE id = NEW.doctor_id;
    END IF;

    SELECT id INTO inv_id FROM public.invoices WHERE appointment_id = NEW.id;
    IF inv_id IS NULL THEN
      INSERT INTO public.invoices (patient_id, appointment_id, description, consultation_fee, subtotal, amount, status)
      VALUES (NEW.patient_id, NEW.id, 'Consultation', fee, fee, fee, 'pending')
      RETURNING id INTO inv_id;
    ELSE
      UPDATE public.invoices SET consultation_fee = fee WHERE id = inv_id;
    END IF;
    PERFORM public.fn_recalc_invoice(inv_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoice_on_checkin ON public.appointments;
CREATE TRIGGER trg_invoice_on_checkin
  AFTER UPDATE OF checked_in_at ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.fn_invoice_on_checkin();

-- 4. Extend invoice-paid trigger to also release consultation appointments
CREATE OR REPLACE FUNCTION public.fn_invoice_paid_release_labs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' AND NEW.appointment_id IS NOT NULL THEN
    UPDATE public.lab_requests
      SET status = 'pending'
      WHERE appointment_id = NEW.appointment_id AND status = 'awaiting_payment';

    UPDATE public.appointments
      SET status = 'confirmed'
      WHERE id = NEW.appointment_id AND status = 'awaiting_payment';

    INSERT INTO public.notifications (recipient_role, title, body, link)
    VALUES ('lab_technician', 'Lab tests ready', 'Payment received. Linked tests are now ready for processing.', '/lab-requests');

    INSERT INTO public.notifications (recipient_role, title, body, link)
    VALUES ('doctor', 'Consultation ready', 'Patient payment received. Ready for consultation.', '/appointments');
  END IF;
  RETURN NEW;
END $$;
