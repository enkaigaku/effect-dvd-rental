import { Context, Data, Effect, Layer } from "effect";
import { SqlClient, SqlError } from "effect/sql";
import { RentalDetail, RentalCreated, RentalReturned } from "../schema/Rental.js";
import { CustomerInfo } from "../schema/Customer.js";
import { RentalId, InventoryId, CustomerId, StoreId, StaffId, FilmId } from "../schema/Ids.js";
import { CustomerStanding } from "../domain/RentalPolicy.js";
import { lateFeeCents, toCents, fromCents } from "../domain/Pricing.js";

// The copy picked for this rental was rented out by a concurrent transaction
// (rental_open_inventory_uniq). Callers treat it like "no copy available".
export class InventoryAlreadyRentedError extends Data.TaggedError("InventoryAlreadyRentedError")<{
  readonly inventoryId: InventoryId;
}> {}

export interface FilmRentalTerms {
  readonly filmId: FilmId;
  readonly title: string;
  readonly rentalRateCents: number;
  readonly rentalDuration: number;
}

// ============================================================
// Rental Repository
// ============================================================

export class RentalRepository extends Context.Service<RentalRepository>()("RentalRepository", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    return {
      // Run several repository calls atomically. Nested calls become savepoints.
      transaction: <A, E, R>(effect: Effect.Effect<A, E, R>) => sql.withTransaction(effect),

      // Create a new rental. Atomic on its own (single INSERT); callers that
      // also check eligibility or take payment wrap it in `transaction`.
      createRental: (inventoryId: InventoryId, customerId: CustomerId, staffId: StaffId) =>
        Effect.gen(function* () {
          // Get film info for the inventory item
          const filmRows = yield* sql`
            SELECT f.title, f.rental_duration
            FROM film f
            JOIN inventory i ON f.film_id = i.film_id
            WHERE i.inventory_id = ${inventoryId}
          `;

          // Callers only pass IDs they just selected, so a miss is a bug
          if (!filmRows[0]) {
            return yield* Effect.die(new Error(`Inventory ${inventoryId} not found`));
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
          `.pipe(
            Effect.catchIf(
              (e): e is SqlError.SqlError =>
                SqlError.isSqlError(e) && e.reason._tag === "UniqueViolation",
              () => Effect.fail(new InventoryAlreadyRentedError({ inventoryId })),
            ),
          );

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

      // Return a rental (mark as returned)
      returnRental: (rentalId: RentalId) =>
        sql.withTransaction(
          Effect.gen(function* () {
            // Get rental info
            const rentalRows = yield* sql`
              SELECT r.rental_id, r.customer_id, r.rental_date, r.return_date, f.rental_duration, f.rental_rate
              FROM rental r
              JOIN inventory i ON r.inventory_id = i.inventory_id
              JOIN film f ON i.film_id = f.film_id
              WHERE r.rental_id = ${rentalId}
              FOR UPDATE OF r
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

            // Calculate rental days and late fee
            const rentalDays = Math.ceil(
              (returnDate.getTime() - rentalDate.getTime()) / (24 * 60 * 60 * 1000),
            );
            const feeCents = lateFeeCents(rentalDays, rentalDuration, toCents(row.rental_rate));
            const lateFee = fromCents(feeCents);

            // Update rental with return date
            yield* sql`
              UPDATE rental
              SET return_date = ${returnDate}
              WHERE rental_id = ${rentalId}
            `;

            // Record the late fee so it shows up in the customer's balance
            if (feeCents > 0) {
              yield* sql`
                INSERT INTO customer_charge (customer_id, rental_id, kind, amount, description)
                VALUES (
                  ${row.customer_id},
                  ${rentalId},
                  'late_fee',
                  ${lateFee},
                  ${`${rentalDays - rentalDuration} day(s) late`}
                )
              `;
            }

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

      // What the eligibility rules need to know about a customer. With
      // `lock`, the customer row is locked until the surrounding transaction
      // ends, so concurrent checkouts for one customer are serialized and
      // cannot both slip under the open-rental limit.
      getCustomerStanding: (customerId: CustomerId, options: { readonly lock: boolean }) =>
        Effect.gen(function* () {
          // Lock in its own statement: under READ COMMITTED a statement that
          // waits for a row lock still evaluates its subqueries with the
          // snapshot taken before the wait, so counting in the same statement
          // would miss rentals committed by the transaction we waited for.
          if (options.lock) {
            yield* sql`SELECT 1 FROM customer WHERE customer_id = ${customerId} FOR UPDATE`;
          }

          const rows = yield* sql`
            SELECT
              c.customer_id,
              c.activebool AS is_active,
              (
                SELECT COUNT(*) FROM rental r
                WHERE r.customer_id = c.customer_id AND r.return_date IS NULL
              ) AS open_rentals,
              (
                SELECT COUNT(*) FROM rental r
                JOIN inventory i ON r.inventory_id = i.inventory_id
                JOIN film f ON i.film_id = f.film_id
                WHERE r.customer_id = c.customer_id
                  AND r.return_date IS NULL
                  AND r.rental_date + f.rental_duration * INTERVAL '1 day' < now()
              ) AS overdue_rentals,
              customer_outstanding_balance(c.customer_id) AS balance
            FROM customer c
            WHERE c.customer_id = ${customerId}
          `;

          const row = rows[0] as any;
          if (!row) return undefined;

          return {
            customerId: row.customer_id as CustomerId,
            isActive: row.is_active,
            openRentals: Number(row.open_rentals),
            overdueRentals: Number(row.overdue_rentals),
            balanceCents: toCents(row.balance),
          } satisfies CustomerStanding;
        }),

      // Price and duration of each requested film; unknown IDs are simply absent
      getFilmRentalTerms: (filmIds: ReadonlyArray<FilmId>) =>
        Effect.gen(function* () {
          if (filmIds.length === 0) return [];
          const rows = yield* sql`
            SELECT film_id, title, rental_rate, rental_duration
            FROM film
            WHERE film_id IN ${sql.in(filmIds)}
          `;

          return rows.map(
            (row: any): FilmRentalTerms => ({
              filmId: row.film_id as FilmId,
              title: row.title,
              rentalRateCents: toCents(row.rental_rate),
              rentalDuration: row.rental_duration,
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
