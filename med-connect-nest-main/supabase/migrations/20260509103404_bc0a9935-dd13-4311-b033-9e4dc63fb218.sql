
-- =========================================================
-- HELPERS
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select exists(select 1 from public.user_roles
    where user_id=_user_id and role in ('staff','admin','doctor','nurse','lab_technician'))
$$;

CREATE OR REPLACE FUNCTION public.is_nurse(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role='nurse')
$$;

CREATE OR REPLACE FUNCTION public.is_lab_tech(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role='lab_technician')
$$;

-- =========================================================
-- INVOICES — fee breakdown
-- =========================================================
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS appointment_id uuid,
  ADD COLUMN IF NOT EXISTS consultation_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS medicine_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lab_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_charge numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal numeric NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_appointment_unique
  ON public.invoices (appointment_id) WHERE appointment_id IS NOT NULL;

-- =========================================================
-- PRESCRIPTIONS — pharmacy state
-- =========================================================
ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS drug_id uuid,
  ADD COLUMN IF NOT EXISTS dispensed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispensed_by uuid;

-- =========================================================
-- LAB REQUESTS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.lab_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  doctor_id uuid,
  appointment_id uuid,
  test_name text NOT NULL,
  test_fee numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  result_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.lab_requests ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- TRIGGER FUNCTIONS
-- =========================================================

-- Auto-create invoice when appointment status -> completed
CREATE OR REPLACE FUNCTION public.fn_invoice_on_appt_completed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  fee numeric := 0;
  charge numeric := 0;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    IF NEW.doctor_id IS NOT NULL THEN
      SELECT COALESCE(consultation_fee, 0) INTO fee FROM public.doctors WHERE id = NEW.doctor_id;
    END IF;
    charge := round(fee * 0.10, 2);

    INSERT INTO public.invoices (patient_id, appointment_id, description, consultation_fee, service_charge, subtotal, amount, status)
    VALUES (NEW.patient_id, NEW.id, 'Consultation', fee, charge, fee, fee + charge, 'pending')
    ON CONFLICT (appointment_id) DO UPDATE
      SET consultation_fee = EXCLUDED.consultation_fee,
          service_charge   = EXCLUDED.service_charge,
          subtotal         = public.invoices.medicine_cost + public.invoices.lab_cost + EXCLUDED.consultation_fee,
          amount           = public.invoices.medicine_cost + public.invoices.lab_cost + EXCLUDED.consultation_fee + EXCLUDED.service_charge;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoice_on_appt_completed ON public.appointments;
CREATE TRIGGER trg_invoice_on_appt_completed
AFTER UPDATE OF status ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.fn_invoice_on_appt_completed();

-- Add lab fee to invoice when a lab_request is completed
CREATE OR REPLACE FUNCTION public.fn_lab_fee_to_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  inv_id uuid;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') AND NEW.appointment_id IS NOT NULL THEN
    SELECT id INTO inv_id FROM public.invoices WHERE appointment_id = NEW.appointment_id;
    IF inv_id IS NOT NULL THEN
      UPDATE public.invoices
        SET lab_cost = lab_cost + COALESCE(NEW.test_fee, 0),
            amount   = consultation_fee + medicine_cost + lab_cost + COALESCE(NEW.test_fee, 0) + service_charge
        WHERE id = inv_id;
    ELSE
      INSERT INTO public.invoices (patient_id, appointment_id, description, lab_cost, subtotal, amount, status)
      VALUES (NEW.patient_id, NEW.appointment_id, 'Lab tests', NEW.test_fee, NEW.test_fee, NEW.test_fee, 'pending');
    END IF;
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lab_fee_to_invoice ON public.lab_requests;
CREATE TRIGGER trg_lab_fee_to_invoice
BEFORE UPDATE OF status ON public.lab_requests
FOR EACH ROW EXECUTE FUNCTION public.fn_lab_fee_to_invoice();

-- Decrement stock + add medicine cost when prescription dispensed
CREATE OR REPLACE FUNCTION public.fn_dispense_prescription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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

    -- Find linked invoice via medical_record -> appointment
    SELECT mr.appointment_id INTO appt_id FROM public.medical_records mr WHERE mr.id = NEW.record_id;
    IF appt_id IS NOT NULL THEN
      SELECT id INTO inv_id FROM public.invoices WHERE appointment_id = appt_id;
      IF inv_id IS NOT NULL THEN
        UPDATE public.invoices
          SET medicine_cost = medicine_cost + cost,
              amount = consultation_fee + medicine_cost + cost + lab_cost + service_charge
          WHERE id = inv_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_dispense_prescription ON public.prescriptions;
CREATE TRIGGER trg_dispense_prescription
BEFORE UPDATE OF status ON public.prescriptions
FOR EACH ROW EXECUTE FUNCTION public.fn_dispense_prescription();

-- =========================================================
-- RLS — lab_requests
-- =========================================================
DROP POLICY IF EXISTS "patient view own lab requests" ON public.lab_requests;
CREATE POLICY "patient view own lab requests" ON public.lab_requests
  FOR SELECT USING (auth.uid() = patient_id);

DROP POLICY IF EXISTS "staff view lab requests" ON public.lab_requests;
CREATE POLICY "staff view lab requests" ON public.lab_requests
  FOR SELECT USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "doctor create lab requests" ON public.lab_requests;
CREATE POLICY "doctor create lab requests" ON public.lab_requests
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'doctor') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "lab tech update requests" ON public.lab_requests;
CREATE POLICY "lab tech update requests" ON public.lab_requests
  FOR UPDATE USING (public.is_lab_tech(auth.uid()) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_lab_tech(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- RLS — vitals (nurse already covered by is_staff which now includes nurse)
-- =========================================================
-- vitals existing policies use is_staff — already updated above.

-- =========================================================
-- RLS — lab_results: lab_tech can manage
-- =========================================================
DROP POLICY IF EXISTS "lab tech manage results" ON public.lab_results;
CREATE POLICY "lab tech manage results" ON public.lab_results
  FOR ALL USING (public.is_lab_tech(auth.uid())) WITH CHECK (public.is_lab_tech(auth.uid()));
