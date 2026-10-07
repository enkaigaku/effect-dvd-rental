import { describe, it, expect } from "bun:test";
import { Effect, Exit, Layer } from "effect";
import { RentalService } from "../../src/service/RentalService.js";
import {
  RentalRepository,
  FilmRentalTerms,
  InventoryAlreadyRentedError,
} from "../../src/repository/RentalRepository.js";
import { InventoryRepository } from "../../src/repository/InventoryRepository.js";
import { PaymentRepository } from "../../src/repository/PaymentRepository.js";
import { RentalPolicy, CustomerStanding } from "../../src/domain/RentalPolicy.js";
import { CreateRentalInput, RentalCreated } from "../../src/schema/Rental.js";
import { CheckoutInput } from "../../src/schema/Checkout.js";
import { PaymentCreated } from "../../src/schema/Payment.js";
import {
  CustomerId,
  StoreId,
  FilmId,
  RentalId,
  InventoryId,
  StaffId,
  PaymentId,
} from "../../src/schema/Ids.js";

// ============================================================
// Mock repositories: the real RentalService.make runs against these
// ============================================================

const goodStanding: CustomerStanding = {
  customerId: 1 as CustomerId,
  isActive: true,
  openRentals: 0,
  overdueRentals: 0,
  balanceCents: 0,
};

const films: Record<number, FilmRentalTerms> = {
  1: { filmId: 1 as FilmId, title: "CHEAP", rentalRateCents: 99, rentalDuration: 3 },
  2: { filmId: 2 as FilmId, title: "MID", rentalRateCents: 299, rentalDuration: 5 },
  3: { filmId: 3 as FilmId, title: "PRICEY", rentalRateCents: 499, rentalDuration: 7 },
};

interface Setup {
  standing?: CustomerStanding | undefined;
  /** films with no copy at the store */
  outOfStock?: ReadonlyArray<number>;
  /** inventory IDs whose INSERT hits the unique index (lost a race) */
  raced?: ReadonlyArray<number>;
}

const makeTest = (setup: Setup = {}) => {
  const standing = "standing" in setup ? setup.standing : goodStanding;
  const writes = {
    lockedStanding: [] as Array<boolean>,
    reserved: [] as Array<number>,
    rentals: [] as Array<{ inventoryId: number; staffId: number }>,
    payments: [] as Array<{ rentalId: number; amount: number }>,
    charges: [] as Array<{ rentalId: number; kind: string; amount: number }>,
    transactions: 0,
  };
  const inventoryFor = (filmId: number) => (setup.outOfStock?.includes(filmId) ? undefined : (filmId * 100) as InventoryId);

  const RentalRepoMock = Layer.succeed(RentalRepository, {
    transaction: (effect) => {
      writes.transactions++;
      return effect;
    },
    getCustomerStanding: (_id, { lock }) => {
      writes.lockedStanding.push(lock);
      return Effect.succeed(standing);
    },
    getFilmRentalTerms: (ids) => Effect.succeed(ids.flatMap((id) => (films[id] ? [films[id]] : []))),
    createRental: (inventoryId, customerId, staffId) => {
      if (setup.raced?.includes(inventoryId)) return Effect.fail(new InventoryAlreadyRentedError({ inventoryId }));
      writes.rentals.push({ inventoryId, staffId });
      const film = films[inventoryId / 100]!;
      return Effect.succeed(
        new RentalCreated({
          rentalId: (1000 + writes.rentals.length) as RentalId,
          rentalDate: new Date(),
          inventoryId,
          filmTitle: film.title,
          customerId,
          dueDate: new Date(Date.now() + film.rentalDuration * 86_400_000),
        }),
      );
    },
    returnRental: () => Effect.die("unused"),
    findById: () => Effect.succeed(undefined),
    getCustomerRentals: () => Effect.succeed([]),
    getCustomer: () => Effect.succeed(undefined),
  });

  const InventoryRepoMock = Layer.succeed(InventoryRepository, {
    getFilmAvailability: () => Effect.succeed(undefined),
    getFilmAvailabilityAllStores: () => Effect.succeed([]),
    findAvailableInventory: (filmId) => Effect.succeed(inventoryFor(filmId)),
    reserveAvailableInventory: (filmId) => {
      writes.reserved.push(filmId);
      return Effect.succeed(inventoryFor(filmId));
    },
    getStores: () => Effect.succeed([]),
    getStoreById: () => Effect.succeed(undefined),
  });

  const PaymentRepoMock = Layer.succeed(PaymentRepository, {
    createPayment: (customerId, rentalId, amount) => {
      writes.payments.push({ rentalId, amount });
      return Effect.succeed(
        new PaymentCreated({
          paymentId: (5000 + writes.payments.length) as PaymentId,
          customerId,
          rentalId,
          amount,
          paymentDate: new Date(),
        }),
      );
    },
    addCharge: (_customerId, rentalId, kind, amount) => {
      writes.charges.push({ rentalId, kind, amount });
      return Effect.void;
    },
    getCustomerBalance: () => Effect.succeed(undefined),
    getCustomerPayments: () => Effect.succeed([]),
    findById: () => Effect.succeed(undefined),
  });

  const PolicyMock = Layer.succeed(RentalPolicy, { maxOpenRentals: 5, maxBalanceCents: 1000 });

  const layer = Layer.effect(RentalService, RentalService.make).pipe(
    Layer.provide([RentalRepoMock, InventoryRepoMock, PaymentRepoMock, PolicyMock]),
  );

  const run = <A, E>(f: (s: RentalService["Service"]) => Effect.Effect<A, E>) =>
    Effect.runPromiseExit(
      Effect.gen(function* () {
        return yield* f(yield* RentalService);
      }).pipe(Effect.provide(layer)),
    );

  return { writes, run };
};

const failureTag = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? (exit.cause.reasons[0] as any)?.error?._tag : undefined;
const failure = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isFailure(exit) ? (exit.cause.reasons[0] as any)?.error : undefined;

const basket = (filmIds: Array<number>) =>
  new CheckoutInput({ customerId: 1 as CustomerId, storeId: 1 as StoreId, filmIds: filmIds as Array<FilmId> });

const rentalInput = new CreateRentalInput({ filmId: 2 as FilmId, customerId: 1 as CustomerId, storeId: 1 as StoreId });

// ============================================================
// createRental
// ============================================================

describe("RentalService.createRental", () => {
  it("checks eligibility with the customer locked, reserves a copy and rents it in one transaction", async () => {
    const { writes, run } = makeTest();
    const exit = await run((s) => s.createRental(rentalInput));

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(writes.transactions).toBe(1);
    expect(writes.lockedStanding).toEqual([true]);
    expect(writes.reserved).toEqual([2]);
    expect(writes.rentals).toEqual([{ inventoryId: 200, staffId: 1 }]);
  });

  it("fails with CustomerNotFoundError for an unknown customer", async () => {
    const { writes, run } = makeTest({ standing: undefined });
    const exit = await run((s) => s.createRental(rentalInput));

    expect(failureTag(exit)).toBe("CustomerNotFoundError");
    expect(writes.rentals).toEqual([]);
  });

  it("fails with every eligibility reason and rents nothing", async () => {
    const { writes, run } = makeTest({ standing: { ...goodStanding, isActive: false, overdueRentals: 1 } });
    const exit = await run((s) => s.createRental(rentalInput));

    expect(failureTag(exit)).toBe("CustomerNotEligibleError");
    expect(failure(exit).reasons.map((r: any) => r.code)).toEqual(["ACCOUNT_INACTIVE", "OVERDUE_RENTALS"]);
    expect(writes.reserved).toEqual([]);
    expect(writes.rentals).toEqual([]);
  });

  it("fails with NoInventoryAvailableError when no copy is free", async () => {
    const { run } = makeTest({ outOfStock: [2] });
    const exit = await run((s) => s.createRental(rentalInput));
    expect(failureTag(exit)).toBe("NoInventoryAvailableError");
  });

  it("reports a lost race on the copy as NoInventoryAvailableError", async () => {
    const { run } = makeTest({ raced: [200] });
    const exit = await run((s) => s.createRental(rentalInput));
    expect(failureTag(exit)).toBe("NoInventoryAvailableError");
  });
});

// ============================================================
// quoteCheckout
// ============================================================

describe("RentalService.quoteCheckout", () => {
  it("prices the basket without locking, reserving or writing anything", async () => {
    const { writes, run } = makeTest();
    const exit = await run((s) => s.quoteCheckout(basket([1, 2, 3])));

    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) {
      expect(exit.value.lines.map((l) => l.amount)).toEqual([0, 2.99, 4.99]);
      expect(exit.value.subtotal).toBe(8.97);
      expect(exit.value.discount).toBe(0.99);
      expect(exit.value.total).toBe(7.98);
    }
    expect(writes.transactions).toBe(0);
    expect(writes.lockedStanding).toEqual([false]);
    expect(writes.reserved).toEqual([]);
    expect(writes.rentals).toEqual([]);
  });

  it("lists every unknown film", async () => {
    const { run } = makeTest();
    const exit = await run((s) => s.quoteCheckout(basket([1, 98, 99])));
    expect(failureTag(exit)).toBe("FilmsNotFoundError");
    expect(failure(exit).filmIds).toEqual([98, 99]);
  });

  it("counts the whole basket toward the open-rental limit", async () => {
    const { run } = makeTest({ standing: { ...goodStanding, openRentals: 3 } });
    const exit = await run((s) => s.quoteCheckout(basket([1, 2, 3])));
    expect(failureTag(exit)).toBe("CustomerNotEligibleError");
    expect(failure(exit).reasons.map((r: any) => r.code)).toEqual(["RENTAL_LIMIT_EXCEEDED"]);
  });

  it("lists every film with no free copy", async () => {
    const { run } = makeTest({ outOfStock: [1, 3] });
    const exit = await run((s) => s.quoteCheckout(basket([1, 2, 3])));
    expect(failureTag(exit)).toBe("FilmsUnavailableError");
    expect(failure(exit).filmIds).toEqual([1, 3]);
  });
});

// ============================================================
// checkout
// ============================================================

describe("RentalService.checkout", () => {
  it("rents every film, pays each charged line and credits the promotion, in one transaction", async () => {
    const { writes, run } = makeTest();
    const exit = await run((s) => s.checkout(basket([1, 2, 3]), 7 as StaffId));

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(writes.transactions).toBe(1);
    expect(writes.lockedStanding).toEqual([true]);
    expect(writes.rentals).toEqual([
      { inventoryId: 100, staffId: 7 },
      { inventoryId: 200, staffId: 7 },
      { inventoryId: 300, staffId: 7 },
    ]);
    // The free disc gets no payment, only a discount credit
    expect(writes.payments).toEqual([
      { rentalId: 1002, amount: 2.99 },
      { rentalId: 1003, amount: 4.99 },
    ]);
    expect(writes.charges).toEqual([{ rentalId: 1001, kind: "discount", amount: -0.99 }]);

    if (Exit.isSuccess(exit)) {
      const receipt = exit.value;
      expect(receipt.staffId).toBe(7 as StaffId);
      expect(receipt.total).toBe(7.98);
      expect(receipt.rentals.map((r) => r.paymentId)).toEqual([null, 5001 as PaymentId, 5002 as PaymentId]);
      expect(receipt.rentals.map((r) => r.amountPaid)).toEqual([0, 2.99, 4.99]);
    }
  });

  it("reserves every film before writing, and writes nothing if any is unavailable", async () => {
    const { writes, run } = makeTest({ outOfStock: [2] });
    const exit = await run((s) => s.checkout(basket([1, 2, 3]), 1 as StaffId));

    expect(failureTag(exit)).toBe("FilmsUnavailableError");
    expect(failure(exit).filmIds).toEqual([2]);
    expect(writes.reserved).toEqual([1, 2, 3]);
    expect(writes.rentals).toEqual([]);
    expect(writes.payments).toEqual([]);
  });

  it("reports a lost race on a copy as FilmsUnavailableError for that film", async () => {
    const { run } = makeTest({ raced: [300] });
    const exit = await run((s) => s.checkout(basket([1, 2, 3]), 1 as StaffId));
    expect(failureTag(exit)).toBe("FilmsUnavailableError");
    expect(failure(exit).filmIds).toEqual([3]);
  });

  it("does not reserve copies for an ineligible customer", async () => {
    const { writes, run } = makeTest({ standing: { ...goodStanding, balanceCents: 2500 } });
    const exit = await run((s) => s.checkout(basket([1]), 1 as StaffId));

    expect(failureTag(exit)).toBe("CustomerNotEligibleError");
    expect(writes.reserved).toEqual([]);
  });
});
