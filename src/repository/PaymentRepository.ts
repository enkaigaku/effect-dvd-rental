import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { PaymentDetail, PaymentCreated, CustomerBalance } from "../schema/Payment.js";
import { PaymentId, CustomerId, RentalId, StaffId } from "../schema/Ids.js";

// ============================================================
// Payment Repository
// ============================================================

export class PaymentRepository extends Context.Service<PaymentRepository>()("PaymentRepository", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    return {
      // Create a new payment
      createPayment: (customerId: CustomerId, rentalId: RentalId, amount: number, staffId: StaffId) =>
        Effect.gen(function* () {
          const paymentDate = new Date();

          const rows = yield* sql`
            INSERT INTO payment (customer_id, staff_id, rental_id, amount, payment_date)
            VALUES (${customerId}, ${staffId}, ${rentalId}, ${amount}, ${paymentDate})
            RETURNING payment_id
          `;

          const paymentId = rows[0]?.["payment_id"] as number;

          return new PaymentCreated({
            paymentId: paymentId as PaymentId,
            customerId: customerId as CustomerId,
            rentalId: rentalId as RentalId,
            amount,
            paymentDate,
          });
        }),

      // Record a non-rental charge (late_fee > 0) or credit (discount < 0)
      addCharge: (
        customerId: CustomerId,
        rentalId: RentalId,
        kind: "late_fee" | "discount",
        amount: number,
        description: string,
      ) =>
        sql`
          INSERT INTO customer_charge (customer_id, rental_id, kind, amount, description)
          VALUES (${customerId}, ${rentalId}, ${kind}, ${amount}, ${description})
        `.pipe(Effect.asVoid),

      // Get customer balance (total unpaid)
      getCustomerBalance: (customerId: CustomerId) =>
        Effect.gen(function* () {
          // Get customer name
          const customerRows = yield* sql`
            SELECT CONCAT(first_name, ' ', last_name) as name
            FROM customer
            WHERE customer_id = ${customerId}
          `;

          if (!customerRows[0]) return undefined;

          const customerName = customerRows[0]["name"] as string;

          // Rental fees + late fees/discounts - payments (see 007_rental_operations.sql)
          const balanceRows = yield* sql`
            SELECT customer_outstanding_balance(${customerId}) AS balance
          `;

          const balance = Number(balanceRows[0]?.["balance"] ?? 0);

          return new CustomerBalance({
            customerId: customerId as CustomerId,
            customerName,
            balance,
          });
        }),

      // Get customer payments
      getCustomerPayments: (customerId: CustomerId, limit: number = 20) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT 
              p.payment_id,
              p.customer_id,
              CONCAT(c.first_name, ' ', c.last_name) as customer_name,
              p.rental_id,
              f.title as film_title,
              p.amount,
              p.payment_date
            FROM payment p
            JOIN customer c ON p.customer_id = c.customer_id
            JOIN rental r ON p.rental_id = r.rental_id
            JOIN inventory i ON r.inventory_id = i.inventory_id
            JOIN film f ON i.film_id = f.film_id
            WHERE p.customer_id = ${customerId}
            ORDER BY p.payment_date DESC
            LIMIT ${limit}
          `;

          return rows.map((row: any) => new PaymentDetail({
            paymentId: row.payment_id as PaymentId,
            customerId: row.customer_id as CustomerId,
            customerName: row.customer_name,
            rentalId: row.rental_id as RentalId,
            filmTitle: row.film_title,
            amount: Number(row.amount),
            paymentDate: row.payment_date,
          }));
        }),

      // Find payment by ID
      findById: (paymentId: PaymentId) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT 
              p.payment_id,
              p.customer_id,
              CONCAT(c.first_name, ' ', c.last_name) as customer_name,
              p.rental_id,
              f.title as film_title,
              p.amount,
              p.payment_date
            FROM payment p
            JOIN customer c ON p.customer_id = c.customer_id
            JOIN rental r ON p.rental_id = r.rental_id
            JOIN inventory i ON r.inventory_id = i.inventory_id
            JOIN film f ON i.film_id = f.film_id
            WHERE p.payment_id = ${paymentId}
          `;

          if (!rows[0]) return undefined;

          const row = rows[0] as any;
          return new PaymentDetail({
            paymentId: row.payment_id as PaymentId,
            customerId: row.customer_id as CustomerId,
            customerName: row.customer_name,
            rentalId: row.rental_id as RentalId,
            filmTitle: row.film_title,
            amount: Number(row.amount),
            paymentDate: row.payment_date,
          });
        }),
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
