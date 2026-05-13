
-- 1. Add new enum value
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'pending_verification';
