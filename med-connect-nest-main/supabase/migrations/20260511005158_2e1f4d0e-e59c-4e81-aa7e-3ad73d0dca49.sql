
CREATE OR REPLACE FUNCTION public.fn_lab_fee_to_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END $$;
