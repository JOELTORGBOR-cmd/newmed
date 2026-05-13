
-- Trigger: when a payment is inserted, set invoice to pending_verification + notify accountant
CREATE OR REPLACE FUNCTION public.fn_payment_pending_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pname text;
BEGIN
  IF NEW.invoice_id IS NOT NULL THEN
    UPDATE public.invoices
      SET status = 'pending_verification'
      WHERE id = NEW.invoice_id AND status <> 'paid';

    SELECT p.full_name INTO pname FROM public.profiles p WHERE p.id = NEW.patient_id;

    INSERT INTO public.notifications (recipient_role, title, body, link)
    VALUES (
      'accountant',
      'Payment awaiting verification',
      COALESCE(pname,'A patient') || ' submitted a payment of GHS ' || NEW.amount::text || ' (' || NEW.reference || ').',
      '/billing-center'
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_payment_pending_verification ON public.payments;
CREATE TRIGGER trg_payment_pending_verification
  AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_payment_pending_verification();

-- Realtime
ALTER TABLE public.invoices REPLICA IDENTITY FULL;
ALTER TABLE public.payments REPLICA IDENTITY FULL;
ALTER TABLE public.appointments REPLICA IDENTITY FULL;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.payments; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
