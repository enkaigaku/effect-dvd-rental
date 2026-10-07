import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Effect, Exit, Layer, ManagedRuntime } from "effect";
import { SqlClient } from "effect/sql";
import { RentalService } from "../../src/service/RentalService.js";
import { PaymentRepository } from "../../src/repository/PaymentRepository.js";
import { CreateRentalInput } from "../../src/schema/Rental.js";
import { CheckoutInput } from "../../src/schema/Checkout.js";
import { CustomerId, FilmId, RentalId, StaffId, StoreId } from "../../src/schema/Ids.js";
import { TestDatabaseLayer } from "../utils/testDb.js";

// ============================================================
// Rental operations against the real database: concurrency, late fees,
// checkout atomicity. Every row a test creates is deleted in afterAll.
// ============================================================

const runtime = ManagedRuntime.make(
  Layer.mergeAll(RentalService.layer, PaymentRepository.layer).pipe(Layer.provideMerge(TestDatabaseLayer)),
);

const run = <A, E>(effect: Effect.Effect<A, E, RentalService | PaymentRepository | SqlClient.SqlClient>) =>
  runtime.runPromiseExit(effect);
const query = async (build: (sql: SqlClient.SqlClient) => Effect.Effect<ReadonlyArray<any>, unknown>) => {
  const exit = await run(
    Effect.gen(function* () {
      return yield* build(yield* SqlClient.SqlClient);
    }),
  );
  if (Exit.isFailure(exit)) throw new Error(String(exit.cause));
  return exit.value;
};
const withRentals = <A, E>(f: (s: RentalService["Service"]) => Effect.Effect<A, E>) =>
  Effect.gen(function* () {
    return yield* f(yield* RentalService);
  });
const failure = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? (exit.cause.reasons[0] as any)?.error : undefined;

const createdRentals: Array<number> = [];
let customers: Array<number> = [];
const STORE = 1 as StoreId;

beforeAll(async () => {
  // Active customers with nothing out and no balance, so the rules let them rent
  const rows = await query((sql) => sql`
    SELECT c.customer_id
    FROM customer c
    WHERE c.activebool
      AND NOT EXISTS (SELECT 1 FROM rental r WHERE r.customer_id = c.customer_id AND r.return_date IS NULL)
      AND customer_outstanding_balance(c.customer_id) <= 0
    ORDER BY c.customer_id DESC
    LIMIT 12
  `);
  customers = rows.map((r) => r.customer_id);
});

afterAll(async () => {
  if (createdRentals.length > 0) {
    await query((sql) => sql`DELETE FROM customer_charge WHERE rental_id IN ${sql.in(createdRentals)}`);
    await query((sql) => sql`DELETE FROM payment WHERE rental_id IN ${sql.in(createdRentals)}`);
    await query((sql) => sql`DELETE FROM rental WHERE rental_id IN ${sql.in(createdRentals)}`);
  }
  await runtime.dispose();
});

// A film with exactly `copies` free copies at the store
const filmWithFreeCopies = async (copies: number) => {
  const rows = await query((sql) => sql`
    SELECT film_id
    FROM inventory
    WHERE store_id = ${STORE} AND inventory_in_stock(inventory_id)
    GROUP BY film_id
    HAVING COUNT(*) = ${copies}
    ORDER BY film_id
    LIMIT 1
  `);
  return rows[0].film_id as FilmId;
};

const rent = (customerId: number, filmId: FilmId) =>
  Effect.gen(function* () {
    const service = yield* RentalService;
    return yield* service.createRental(
      new CreateRentalInput({ filmId, customerId: customerId as CustomerId, storeId: STORE }),
    );
  });

describe("Rental operations (Integration)", () => {
  it("never rents the same copy twice under concurrent requests", async () => {
    const filmId = await filmWithFreeCopies(3);
    const contenders = customers.slice(0, 6);

    const exits = await Promise.all(contenders.map((c) => run(rent(c, filmId))));
    const won = exits.filter(Exit.isSuccess).map((e) => e.value);
    createdRentals.push(...won.map((r) => r.rentalId));

    expect(won).toHaveLength(3);
    expect(new Set(won.map((r) => r.inventoryId)).size).toBe(3);
    for (const lost of exits.filter(Exit.isFailure)) {
      expect(failure(lost)?._tag).toBe("NoInventoryAvailableError");
    }
  });

  it("serializes checkouts for one customer so they cannot exceed the open-rental limit together", async () => {
    const customerId = customers[6]! as CustomerId;
    const free = await query((sql) => sql`
      SELECT DISTINCT film_id FROM inventory
      WHERE store_id = ${STORE} AND inventory_in_stock(inventory_id)
      ORDER BY film_id LIMIT 6
    `);
    const filmIds = free.map((r) => r.film_id as FilmId);
    const checkout = (ids: Array<FilmId>) =>
      withRentals((s) =>
        s.checkout(new CheckoutInput({ customerId, storeId: STORE, filmIds: ids }), 1 as StaffId),
      );

    // 3 + 3 > limit of 5: exactly one of the two may succeed
    const exits = await Promise.all([run(checkout(filmIds.slice(0, 3))), run(checkout(filmIds.slice(3, 6)))]);
    const ok = exits.filter(Exit.isSuccess);
    createdRentals.push(...ok.flatMap((e) => e.value.rentals.map((r) => r.rentalId)));

    expect(ok).toHaveLength(1);
    const rejected = failure(exits.find(Exit.isFailure)!);
    expect(rejected._tag).toBe("CustomerNotEligibleError");
    expect(rejected.reasons.map((r: any) => r.code)).toEqual(["RENTAL_LIMIT_EXCEEDED"]);
  });

  it("leaves the balance unchanged after a paid checkout with a promotion", async () => {
    const customerId = customers[7]! as CustomerId;
    const before = await query((sql) => sql`SELECT customer_outstanding_balance(${customerId}) AS b`);
    const free = await query((sql) => sql`
      SELECT DISTINCT film_id FROM inventory
      WHERE store_id = ${STORE} AND inventory_in_stock(inventory_id)
      ORDER BY film_id DESC LIMIT 3
    `);

    const exit = await run(
      withRentals((s) =>
        s.checkout(
          new CheckoutInput({ customerId, storeId: STORE, filmIds: free.map((r) => r.film_id as FilmId) }),
          1 as StaffId,
        ),
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (!Exit.isSuccess(exit)) return;
    createdRentals.push(...exit.value.rentals.map((r) => r.rentalId));

    expect(exit.value.discount).toBeGreaterThan(0);
    const after = await query((sql) => sql`SELECT customer_outstanding_balance(${customerId}) AS b`);
    expect(Number(after[0].b)).toBe(Number(before[0].b));
  });

  it("writes nothing when one film in the basket has no free copy", async () => {
    const customerId = customers[8]! as CustomerId;
    const available = await filmWithFreeCopies(3);
    const noCopies = await query((sql) => sql`
      SELECT f.film_id FROM film f
      WHERE NOT EXISTS (SELECT 1 FROM inventory i WHERE i.film_id = f.film_id AND i.store_id = ${STORE})
      LIMIT 1
    `);

    const exit = await run(
      withRentals((s) =>
        s.checkout(
          new CheckoutInput({ customerId, storeId: STORE, filmIds: [available, noCopies[0].film_id as FilmId] }),
          1 as StaffId,
        ),
      ),
    );

    expect(failure(exit)?._tag).toBe("FilmsUnavailableError");
    const open = await query((sql) => sql`SELECT COUNT(*)::int AS n FROM rental WHERE customer_id = ${customerId} AND return_date IS NULL`);
    expect(open[0].n).toBe(0);
  });

  it("charges a late fee on return and adds it to the balance", async () => {
    const customerId = customers[9]!;
    const filmId = await filmWithFreeCopies(3);
    const rented = await run(rent(customerId, filmId));
    expect(Exit.isSuccess(rented)).toBe(true);
    if (!Exit.isSuccess(rented)) return;
    const rentalId = rented.value.rentalId;
    createdRentals.push(rentalId);

    // Pretend it went out just under 10 days ago (partial days round up)
    const terms = await query((sql) => sql`
      UPDATE rental SET rental_date = now() - INTERVAL '10 days' + INTERVAL '1 minute' WHERE rental_id = ${rentalId}
      RETURNING (SELECT rental_duration FROM film WHERE film_id = ${filmId}) AS duration,
                (SELECT rental_rate FROM film WHERE film_id = ${filmId}) AS rate
    `);
    const before = await query((sql) => sql`SELECT customer_outstanding_balance(${customerId}) AS b`);

    const returned = await run(withRentals((s) => s.returnRental(rentalId as RentalId)));
    expect(Exit.isSuccess(returned)).toBe(true);
    if (!Exit.isSuccess(returned)) return;

    const expectedFee = Math.round((10 - terms[0].duration) * Number(terms[0].rate) * 100) / 100;
    expect(returned.value.rentalDays).toBe(10);
    expect(returned.value.lateFee).toBe(expectedFee);

    const charges = await query((sql) => sql`SELECT kind, amount FROM customer_charge WHERE rental_id = ${rentalId}`);
    expect(charges.map((c) => [c.kind, Number(c.amount)])).toEqual([["late_fee", expectedFee]]);

    const after = await query((sql) => sql`SELECT customer_outstanding_balance(${customerId}) AS b`);
    expect(Number(after[0].b)).toBeCloseTo(Number(before[0].b) + expectedFee, 2);

    // Returning again is rejected and does not charge twice
    const again = await run(withRentals((s) => s.returnRental(rentalId as RentalId)));
    expect(failure(again)?._tag).toBe("RentalAlreadyReturnedError");
  });

  it("lets a new payment be stored (default payment partition)", async () => {
    const exit = await run(
      Effect.gen(function* () {
        const repo = yield* PaymentRepository;
        return yield* repo.createPayment(customers[9]! as CustomerId, createdRentals.at(-1)! as RentalId, 0.5, 1 as StaffId);
      }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
  });
});
