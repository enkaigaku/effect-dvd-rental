import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { RentalDetail, RentalCreated, RentalReturned } from "../schema/Rental.js";
import { CustomerInfo } from "../schema/Customer.js";
import { RentalId, InventoryId, CustomerId, StoreId, StaffId } from "../schema/Ids.js";

// ============================================================
// Rental Repository
// ============================================================

export class RentalRepository extends Context.Service<RentalRepository>()("RentalRepository", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    return {
      // Create a new rental
      createRental: (inventoryId: InventoryId, customerId: CustomerId, staffId: StaffId) =>
        sql.withTransaction(
          Effect.gen(function* () {
            // Get film info for the inventory item
            const filmRows = yield* sql`
              SELECT f.title, f.rental_duration
              FROM film f
              JOIN inventory i ON f.film_id = i.film_id
              WHERE i.inventory_id = ${inventoryId}
            `;

            if (!filmRows[0]) {
              return yield* Effect.fail(new Error("Inventory not found"));
            }

            const filmTitle = filmRows[0]["title"] as string;
            const rentalDuration = filmRows[0]["rental_duration"] as number;

            // Create rental record
            const rentalDate = new Date();
            const dueDate = new Date(rentalDate.getTime() + rentalDuration * 24 * 60 * 60 * 1000);

            const insertResult = yield* sql`
              INSERT INTO rental (rental_date, inventory_id, customer_id, staff_id)
              VALUES (${rentalDate}, ${inventoryId}, ${customerId}, ${staffId})
              RETURNING rental_id
            `;

            const rentalId = insertResult[0]?.["rental_id"] as number;

            return new RentalCreated({
              rentalId: rentalId as RentalId,
              rentalDate,
              inventoryId: inventoryId as InventoryId,
              filmTitle,
              customerId: customerId as CustomerId,
              dueDate,
            });
          }),
        ),

      // Return a rental (mark as returned)
      returnRental: (rentalId: RentalId) =>
        sql.withTransaction(
          Effect.gen(function* () {
            // Get rental info
            const rentalRows = yield* sql`
              SELECT r.rental_id, r.rental_date, r.return_date, f.rental_duration, f.rental_rate
              FROM rental r
              JOIN inventory i ON r.inventory_id = i.inventory_id
              JOIN film f ON i.film_id = f.film_id
              WHERE r.rental_id = ${rentalId}
            `;

            if (!rentalRows[0]) {
              return yield* Effect.fail(new Error("Rental not found"));
            }

            const row = rentalRows[0] as any;
            if (row.return_date) {
              return yield* Effect.fail(new Error("Rental already returned"));
            }

            const returnDate = new Date();
            const rentalDate = new Date(row.rental_date);
            const rentalDuration = row.rental_duration as number;
            const rentalRate = Number(row.rental_rate);

            // Calculate rental days and late fee
            const rentalDays = Math.ceil(
              (returnDate.getTime() - rentalDate.getTime()) / (24 * 60 * 60 * 1000),
            );
            const lateDays = Math.max(0, rentalDays - rentalDuration);
            const lateFee = lateDays * rentalRate;

            // Update rental with return date
            yield* sql`
              UPDATE rental
              SET return_date = ${returnDate}
              WHERE rental_id = ${rentalId}
            `;

            return new RentalReturned({
              rentalId: rentalId as RentalId,
              returnDate,
              rentalDays,
              lateFee,
            });
          }),
        ),

      // Find rental by ID
      findById: (rentalId: RentalId) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT
              r.rental_id,
              r.rental_date,
              r.return_date,
              f.title as film_title,
              CONCAT(c.first_name, ' ', c.last_name) as customer_name,
              c.email as customer_email,
              CONCAT(a.address, ', ', ci.city) as store_name
            FROM rental r
            JOIN inventory i ON r.inventory_id = i.inventory_id
            JOIN film f ON i.film_id = f.film_id
            JOIN customer c ON r.customer_id = c.customer_id
            JOIN store s ON i.store_id = s.store_id
            JOIN address a ON s.address_id = a.address_id
            JOIN city ci ON a.city_id = ci.city_id
            WHERE r.rental_id = ${rentalId}
          `;

          if (!rows[0]) return undefined;

          const row = rows[0] as any;
          return new RentalDetail({
            rentalId: row.rental_id as RentalId,
            rentalDate: row.rental_date,
            returnDate: row.return_date,
            filmTitle: row.film_title,
            customerName: row.customer_name,
            customerEmail: row.customer_email,
            storeName: row.store_name,
            isReturned: row.return_date !== null,
          });
        }),

      // Get customer rentals with pagination
      getCustomerRentals: (customerId: CustomerId, limit: number = 20) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT
              r.rental_id,
              r.rental_date,
              r.return_date,
              f.title as film_title,
              CONCAT(c.first_name, ' ', c.last_name) as customer_name,
              c.email as customer_email,
              CONCAT(a.address, ', ', ci.city) as store_name
            FROM rental r
            JOIN inventory i ON r.inventory_id = i.inventory_id
            JOIN film f ON i.film_id = f.film_id
            JOIN customer c ON r.customer_id = c.customer_id
            JOIN store s ON i.store_id = s.store_id
            JOIN address a ON s.address_id = a.address_id
            JOIN city ci ON a.city_id = ci.city_id
            WHERE r.customer_id = ${customerId}
            ORDER BY r.rental_date DESC
            LIMIT ${limit}
          `;

          return rows.map(
            (row: any) =>
              new RentalDetail({
                rentalId: row.rental_id as RentalId,
                rentalDate: row.rental_date,
                returnDate: row.return_date,
                filmTitle: row.film_title,
                customerName: row.customer_name,
                customerEmail: row.customer_email,
                storeName: row.store_name,
                isReturned: row.return_date !== null,
              }),
          );
        }),

      // Get customer info
      getCustomer: (customerId: CustomerId) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT
              customer_id,
              CONCAT(first_name, ' ', last_name) as full_name,
              email,
              store_id,
              activebool as is_active
            FROM customer
            WHERE customer_id = ${customerId}
          `;

          if (!rows[0]) return undefined;

          const row = rows[0] as any;
          return new CustomerInfo({
            customerId: row.customer_id as CustomerId,
            fullName: row.full_name,
            email: row.email,
            storeId: row.store_id as StoreId,
            isActive: row.is_active,
          });
        }),
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
