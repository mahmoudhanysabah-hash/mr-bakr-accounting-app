ALTER TABLE "monthly_charges"
ADD COLUMN "sibling_discount_amount" DECIMAL(12, 2) NOT NULL DEFAULT 0;
