
-- =========================================================
-- 1. Accountant SELECT policies
-- =========================================================
CREATE POLICY "accountant view lab requests" ON public.lab_requests
  FOR SELECT USING (public.is_accountant(auth.uid()));

CREATE POLICY "accountant view prescriptions" ON public.prescriptions
  FOR SELECT USING (public.is_accountant(auth.uid()));

CREATE POLICY "accountant view drug dispenses" ON public.drug_dispenses
  FOR SELECT USING (public.is_accountant(auth.uid()));

CREATE POLICY "accountant view medical records" ON public.medical_records
  FOR SELECT USING (public.is_accountant(auth.uid()));

-- =========================================================
-- 2. Invoice recalc helper + new triggers
-- =========================================================
CREATE OR REPLACE FUNCTION public.fn_recalc_invoice(_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub numeric := 0;
  svc numeric := 0;
BEGIN
  SELECT COALESCE(consultation_fee,0) + COALESCE(medicine_cost,0) + COALESCE(lab_cost,0)
    INTO sub
    FROM public.invoices WHERE id = _invoice_id;
  svc := round(sub * 0.10, 2);
  UPDATE public.invoices
    SET subtotal = sub,
        service_charge = svc,
        amount = sub + svc
  WHERE id = _invoice_id;
END $$;

-- Replace appt-completed trigger fn: insert/update with consult fee, then recalc
CREATE OR REPLACE FUNCTION public.fn_invoice_on_appt_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fee numeric := 0;
  inv_id uuid;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    IF NEW.doctor_id IS NOT NULL THEN
      SELECT COALESCE(consultation_fee, 0) INTO fee FROM public.doctors WHERE id = NEW.doctor_id;
    END IF;

    INSERT INTO public.invoices (patient_id, appointment_id, description, consultation_fee, service_charge, subtotal, amount, status)
    VALUES (NEW.patient_id, NEW.id, 'Consultation', fee, round(fee*0.10,2), fee, fee + round(fee*0.10,2), 'pending')
    ON CONFLICT (appointment_id) DO UPDATE
      SET consultation_fee = EXCLUDED.consultation_fee
    RETURNING id INTO inv_id;

    PERFORM public.fn_recalc_invoice(inv_id);
  END IF;
  RETURN NEW;
END $$;

-- Replace lab-fee trigger fn
CREATE OR REPLACE FUNCTION public.fn_lab_fee_to_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv_id uuid;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') AND NEW.appointment_id IS NOT NULL THEN
    SELECT id INTO inv_id FROM public.invoices WHERE appointment_id = NEW.appointment_id;
    IF inv_id IS NOT NULL THEN
      UPDATE public.invoices
        SET lab_cost = COALESCE(lab_cost,0) + COALESCE(NEW.test_fee, 0)
        WHERE id = inv_id;
    ELSE
      INSERT INTO public.invoices (patient_id, appointment_id, description, lab_cost, subtotal, amount, status)
      VALUES (NEW.patient_id, NEW.appointment_id, 'Lab tests', COALESCE(NEW.test_fee,0), COALESCE(NEW.test_fee,0), COALESCE(NEW.test_fee,0), 'pending')
      RETURNING id INTO inv_id;
    END IF;
    PERFORM public.fn_recalc_invoice(inv_id);
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END $$;

-- Replace dispense trigger fn
CREATE OR REPLACE FUNCTION public.fn_dispense_prescription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  unit_price numeric := 0;
  appt_id uuid;
  inv_id uuid;
  cost numeric := 0;
BEGIN
  IF NEW.status = 'dispensed' AND (OLD.status IS DISTINCT FROM 'dispensed') THEN
    IF NEW.drug_id IS NOT NULL THEN
      SELECT COALESCE(d.unit_price, 0) INTO unit_price FROM public.drugs d WHERE d.id = NEW.drug_id;
      UPDATE public.drugs SET stock = GREATEST(stock - NEW.quantity, 0) WHERE id = NEW.drug_id;
    END IF;
    cost := unit_price * NEW.quantity;
    NEW.dispensed_at := now();

    SELECT mr.appointment_id INTO appt_id FROM public.medical_records mr WHERE mr.id = NEW.record_id;
    IF appt_id IS NOT NULL THEN
      SELECT id INTO inv_id FROM public.invoices WHERE appointment_id = appt_id;
      IF inv_id IS NULL THEN
        INSERT INTO public.invoices (patient_id, appointment_id, description, medicine_cost, subtotal, amount, status)
        VALUES (NEW.patient_id, appt_id, 'Medication', cost, cost, cost, 'pending')
        RETURNING id INTO inv_id;
      ELSE
        UPDATE public.invoices SET medicine_cost = COALESCE(medicine_cost,0) + cost WHERE id = inv_id;
      END IF;
      PERFORM public.fn_recalc_invoice(inv_id);
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Ensure triggers exist (recreate to be safe; idempotent)
DROP TRIGGER IF EXISTS trg_invoice_on_appt_completed ON public.appointments;
CREATE TRIGGER trg_invoice_on_appt_completed
  AFTER UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.fn_invoice_on_appt_completed();

DROP TRIGGER IF EXISTS trg_lab_fee_to_invoice ON public.lab_requests;
CREATE TRIGGER trg_lab_fee_to_invoice
  BEFORE UPDATE ON public.lab_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_lab_fee_to_invoice();

DROP TRIGGER IF EXISTS trg_dispense_prescription ON public.prescriptions;
CREATE TRIGGER trg_dispense_prescription
  BEFORE UPDATE ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.fn_dispense_prescription();

-- Backfill existing invoices
UPDATE public.invoices SET subtotal = COALESCE(consultation_fee,0)+COALESCE(medicine_cost,0)+COALESCE(lab_cost,0);
UPDATE public.invoices SET service_charge = round(subtotal*0.10, 2);
UPDATE public.invoices SET amount = subtotal + service_charge;

-- =========================================================
-- 3. appointments.doctor_email + privacy
-- =========================================================
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS doctor_email text;
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_email ON public.appointments(doctor_email);

CREATE OR REPLACE FUNCTION public.fn_set_appointment_doctor_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e text;
BEGIN
  IF NEW.doctor_id IS NOT NULL THEN
    SELECT u.email INTO e
      FROM public.doctors d
      JOIN auth.users u ON u.id = d.profile_id
      WHERE d.id = NEW.doctor_id;
    NEW.doctor_email := e;
  ELSE
    NEW.doctor_email := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_appointment_doctor_email ON public.appointments;
CREATE TRIGGER trg_set_appointment_doctor_email
  BEFORE INSERT OR UPDATE OF doctor_id ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_appointment_doctor_email();

-- Backfill
UPDATE public.appointments a
  SET doctor_email = u.email
  FROM public.doctors d
  JOIN auth.users u ON u.id = d.profile_id
  WHERE a.doctor_id = d.id;

-- Tighten doctor visibility on appointments
DROP POLICY IF EXISTS "doctor view all appts" ON public.appointments;
CREATE POLICY "doctor view own appts by email" ON public.appointments
  FOR SELECT USING (
    public.has_role(auth.uid(), 'doctor')
    AND doctor_email = (auth.jwt() ->> 'email')
  );

-- Tighten doctor visibility on medical records (only their own)
DROP POLICY IF EXISTS "doctor view all records" ON public.medical_records;
CREATE POLICY "doctor view own records" ON public.medical_records
  FOR SELECT USING (
    public.has_role(auth.uid(), 'doctor')
    AND doctor_id = public.current_doctor_id()
  );

-- =========================================================
-- 4. vitals.appointment_id + handover notification
-- =========================================================
ALTER TABLE public.vitals ADD COLUMN IF NOT EXISTS appointment_id uuid;
CREATE INDEX IF NOT EXISTS idx_vitals_appointment_recorded
  ON public.vitals(appointment_id, recorded_at DESC);

CREATE OR REPLACE FUNCTION public.fn_notify_vitals_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pname text;
BEGIN
  IF NEW.appointment_id IS NOT NULL THEN
    SELECT p.full_name INTO pname FROM public.profiles p WHERE p.id = NEW.patient_id;
    INSERT INTO public.notifications (recipient_role, title, body, link)
    VALUES ('doctor', 'Vitals ready: ' || COALESCE(pname,'patient'),
            'Nurse has recorded vitals for the upcoming consultation.',
            '/appointments');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_vitals_ready ON public.vitals;
CREATE TRIGGER trg_notify_vitals_ready
  AFTER INSERT ON public.vitals
  FOR EACH ROW EXECUTE FUNCTION public.fn_notify_vitals_ready();
