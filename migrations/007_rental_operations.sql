-- ============================================================
-- Rental operations: payments after 2022, one open rental per copy,
-- and a ledger for charges that are not plain rental fees.
-- ============================================================

-- Pagila only ships monthly payment partitions for 2022-01..2022-07, so any
-- payment dated later has no partition and the INSERT fails. Catch-all
-- partition so new payments can be stored.
CREATE TABLE IF NOT EXISTS payment_p_default PARTITION OF payment DEFAULT;

-- A physical copy can only be out with one customer at a time. Concurrent
-- rentals of the same copy fail with a unique violation instead of silently
-- double-renting it.
CREATE UNIQUE INDEX IF NOT EXISTS rental_open_inventory_uniq
  ON rental (inventory_id)
  WHERE return_date IS NULL;

-- Charges and credits on top of the film's rental_rate:
--   late_fee  (> 0) recorded when a rental comes back after its due date
--   discount  (< 0) promotion applied at checkout
CREATE TABLE IF NOT EXISTS customer_charge (
  charge_id   serial PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customer (customer_id),
  rental_id   integer NOT NULL REFERENCES rental (rental_id),
  kind        text NOT NULL,
  amount      numeric(6, 2) NOT NULL,
  description text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_charge_kind_check CHECK (
    (kind = 'late_fee' AND amount > 0) OR (kind = 'discount' AND amount < 0)
  ),
  CONSTRAINT customer_charge_rental_kind_uniq UNIQUE (rental_id, kind)
);

CREATE INDEX IF NOT EXISTS customer_charge_customer_idx ON customer_charge (customer_id);

-- Outstanding balance: rental fees + recorded charges - payments.
-- Single definition used by the balance endpoint and the rental eligibility check.
CREATE OR REPLACE FUNCTION customer_outstanding_balance(p_customer_id integer)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE((
      SELECT SUM(f.rental_rate)
      FROM rental r
      JOIN inventory i ON r.inventory_id = i.inventory_id
      JOIN film f ON i.film_id = f.film_id
      WHERE r.customer_id = p_customer_id
    ), 0)
    + COALESCE((
      SELECT SUM(amount) FROM customer_charge WHERE customer_id = p_customer_id
    ), 0)
    - COALESCE((
      SELECT SUM(amount) FROM payment WHERE customer_id = p_customer_id
    ), 0)
$$;
