import { Context, Effect, Layer, Data } from "effect";
import { RentalRepository, FilmRentalTerms } from "../repository/RentalRepository.js";
import { InventoryRepository } from "../repository/InventoryRepository.js";
import { PaymentRepository } from "../repository/PaymentRepository.js";
import { CreateRentalInput } from "../schema/Rental.js";
import {
  CheckoutInput,
  CheckoutLine,
  CheckoutQuote,
  CheckoutReceipt,
  CheckoutRental,
  RentalIneligibility,
} from "../schema/Checkout.js";
import { CustomerId, FilmId, StoreId, RentalId, StaffId, InventoryId } from "../schema/Ids.js";
import { RentalPolicy, checkEligibility } from "../domain/RentalPolicy.js";
import { PricedBasket, fromCents, priceBasket } from "../domain/Pricing.js";

// ============================================================
// Rental Service Errors (Data.TaggedError)
// ============================================================

export class CustomerNotFoundError extends Data.TaggedError("CustomerNotFoundError")<{
  readonly customerId: CustomerId;
}> {}

export class CustomerNotEligibleError extends Data.TaggedError("CustomerNotEligibleError")<{
  readonly customerId: CustomerId;
  readonly reasons: ReadonlyArray<RentalIneligibility>;
}> {}

export class NoInventoryAvailableError extends Data.TaggedError("NoInventoryAvailableError")<{
  readonly filmId: FilmId;
  readonly storeId: StoreId;
}> {}

export class FilmsNotFoundError extends Data.TaggedError("FilmsNotFoundError")<{
  readonly filmIds: ReadonlyArray<FilmId>;
}> {}

export class FilmsUnavailableError extends Data.TaggedError("FilmsUnavailableError")<{
  readonly storeId: StoreId;
  readonly filmIds: ReadonlyArray<FilmId>;
}> {}

export class RentalNotFoundError extends Data.TaggedError("RentalNotFoundError")<{
  readonly rentalId: RentalId;
}> {}

export class RentalAlreadyReturnedError extends Data.TaggedError("RentalAlreadyReturnedError")<{
  readonly rentalId: RentalId;
}> {}

// ============================================================
// Rental Service
// ============================================================

export class RentalService extends Context.Service<RentalService>()("RentalService", {
  make: Effect.gen(function* () {
    const rentalRepo = yield* RentalRepository;
    const inventoryRepo = yield* InventoryRepository;
    const paymentRepo = yield* PaymentRepository;
    const policy = yield* RentalPolicy;

    // Fails unless the customer exists and passes every eligibility rule for
    // renting `requested` more discs. With `lock`, the customer row stays
    // locked until the surrounding transaction ends.
    const assertEligible = Effect.fn("RentalService.assertEligible")(function* (
      customerId: CustomerId,
      requested: number,
      lock: boolean,
    ) {
      const standing = yield* rentalRepo.getCustomerStanding(customerId, { lock });
      if (!standing) {
        return yield* Effect.fail(new CustomerNotFoundError({ customerId }));
      }

      const reasons = checkEligibility(standing, requested, policy);
      if (reasons.length > 0) {
        yield* Effect.logInfo(
          `Customer ${customerId} not eligible: ${reasons.map((r) => r.code).join(", ")}`,
        );
        return yield* Effect.fail(new CustomerNotEligibleError({ customerId, reasons }));
      }
      return standing;
    });

    // Validate the basket and price it, in the order the films were requested
    const prepareBasket = Effect.fn("RentalService.prepareBasket")(function* (
      input: CheckoutInput,
      lock: boolean,
    ) {
      const terms = yield* rentalRepo.getFilmRentalTerms(input.filmIds);
      const byId = new Map(terms.map((t) => [t.filmId, t]));
      const missing = input.filmIds.filter((id) => !byId.has(id));
      if (missing.length > 0) {
        return yield* Effect.fail(new FilmsNotFoundError({ filmIds: missing }));
      }

      yield* assertEligible(input.customerId, input.filmIds.length, lock);

      const ordered = input.filmIds.map((id) => byId.get(id)!);
      const basket = priceBasket(
        ordered.map((t) => ({ filmId: t.filmId, filmTitle: t.title, rentalRateCents: t.rentalRateCents })),
      );
      return { terms: ordered, basket };
    });

    const toQuote = (input: CheckoutInput, basket: PricedBasket) =>
      new CheckoutQuote({
        customerId: input.customerId,
        storeId: input.storeId,
        lines: basket.lines.map(
          (l) =>
            new CheckoutLine({
              filmId: l.filmId,
              filmTitle: l.filmTitle,
              rentalRate: fromCents(l.rentalRateCents),
              discount: fromCents(l.discountCents),
              amount: fromCents(l.totalCents),
              promotion: l.promotion,
            }),
        ),
        subtotal: fromCents(basket.subtotalCents),
        discount: fromCents(basket.discountCents),
        total: fromCents(basket.totalCents),
      });

    return {
      // Create a single rental (no payment taken). Eligibility check, copy
      // selection and insert run in one transaction.
      createRental: Effect.fn("RentalService.createRental")(function* (input: CreateRentalInput) {
        yield* Effect.logInfo(
          `Creating rental: film=${input.filmId}, customer=${input.customerId}, store=${input.storeId}`,
        );

        const rental = yield* rentalRepo.transaction(
          Effect.gen(function* () {
            yield* assertEligible(input.customerId, 1, true);

            const noInventory = new NoInventoryAvailableError({ filmId: input.filmId, storeId: input.storeId });
            const inventoryId = yield* inventoryRepo.reserveAvailableInventory(input.filmId, input.storeId);
            if (!inventoryId) {
              return yield* Effect.fail(noInventory);
            }

            return yield* rentalRepo
              .createRental(inventoryId, input.customerId, input.staffId ?? (1 as StaffId))
              .pipe(Effect.catchTag("InventoryAlreadyRentedError", () => Effect.fail(noInventory)));
          }),
        );

        yield* Effect.logInfo(`Rental created: id=${rental.rentalId}`);
        return rental;
      }),

      // Price a basket and check the customer may rent it, without reserving
      // copies or taking payment. Fails with the same errors checkout would.
      quoteCheckout: Effect.fn("RentalService.quoteCheckout")(function* (input: CheckoutInput) {
        const { basket } = yield* prepareBasket(input, false);

        const availability = yield* Effect.forEach(
          input.filmIds,
          (filmId) =>
            inventoryRepo
              .findAvailableInventory(filmId, input.storeId)
              .pipe(Effect.map((inventoryId) => ({ filmId, inventoryId }))),
          { concurrency: 4 },
        );
        const unavailable = availability.filter((a) => !a.inventoryId).map((a) => a.filmId);
        if (unavailable.length > 0) {
          return yield* Effect.fail(new FilmsUnavailableError({ storeId: input.storeId, filmIds: unavailable }));
        }

        return toQuote(input, basket);
      }),

      // Rent several films at once and take payment, all or nothing:
      // customer locked → eligibility → copies reserved → rentals, payments
      // and promotion credits written → commit.
      checkout: Effect.fn("RentalService.checkout")(function* (input: CheckoutInput, staffId: StaffId) {
        yield* Effect.logInfo(
          `Checkout: customer=${input.customerId}, store=${input.storeId}, films=${input.filmIds.join(",")}`,
        );

        const receipt = yield* rentalRepo.transaction(
          Effect.gen(function* () {
            const checkedOutAt = new Date();
            const { terms, basket } = yield* prepareBasket(input, true);

            // Reserve every copy before writing anything, so the error can
            // name all unavailable films rather than just the first
            const reserved: Array<{ terms: FilmRentalTerms; inventoryId: InventoryId | undefined }> = [];
            for (const t of terms) {
              const inventoryId = yield* inventoryRepo.reserveAvailableInventory(t.filmId, input.storeId);
              reserved.push({ terms: t, inventoryId });
            }
            const unavailable = reserved.filter((r) => !r.inventoryId).map((r) => r.terms.filmId);
            if (unavailable.length > 0) {
              return yield* Effect.fail(new FilmsUnavailableError({ storeId: input.storeId, filmIds: unavailable }));
            }

            const rentals: Array<CheckoutRental> = [];
            for (const [i, r] of reserved.entries()) {
              const line = basket.lines[i]!;
              const rental = yield* rentalRepo
                .createRental(r.inventoryId!, input.customerId, staffId)
                .pipe(
                  Effect.catchTag("InventoryAlreadyRentedError", () =>
                    Effect.fail(new FilmsUnavailableError({ storeId: input.storeId, filmIds: [line.filmId] })),
                  ),
                );

              const payment =
                line.totalCents > 0
                  ? yield* paymentRepo.createPayment(
                      input.customerId,
                      rental.rentalId,
                      fromCents(line.totalCents),
                      staffId,
                    )
                  : undefined;

              if (line.discountCents > 0) {
                yield* paymentRepo.addCharge(
                  input.customerId,
                  rental.rentalId,
                  "discount",
                  -fromCents(line.discountCents),
                  line.promotion ?? "Promotion",
                );
              }

              rentals.push(
                new CheckoutRental({
                  rentalId: rental.rentalId,
                  inventoryId: rental.inventoryId,
                  filmId: line.filmId,
                  filmTitle: rental.filmTitle,
                  dueDate: rental.dueDate,
                  rentalRate: fromCents(line.rentalRateCents),
                  discount: fromCents(line.discountCents),
                  amountPaid: fromCents(line.totalCents),
                  promotion: line.promotion,
                  paymentId: payment?.paymentId ?? null,
                }),
              );
            }

            return new CheckoutReceipt({
              customerId: input.customerId,
              storeId: input.storeId,
              staffId,
              checkedOutAt,
              rentals,
              subtotal: fromCents(basket.subtotalCents),
              discount: fromCents(basket.discountCents),
              total: fromCents(basket.totalCents),
            });
          }),
        );

        yield* Effect.logInfo(
          `Checkout complete: customer=${input.customerId}, rentals=${receipt.rentals.map((r) => r.rentalId).join(",")}, total=${receipt.total}`,
        );
        return receipt;
      }),

      // Return a rental
      returnRental: Effect.fn("RentalService.returnRental")(function* (rentalId: RentalId) {
        yield* Effect.logInfo(`Processing return: rentalId=${rentalId}`);

        const result = yield* rentalRepo.returnRental(rentalId).pipe(
          Effect.mapError((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("not found")) {
              return new RentalNotFoundError({ rentalId });
            }
            if (msg.includes("already returned")) {
              return new RentalAlreadyReturnedError({ rentalId });
            }
            return err;
          }),
        );

        yield* Effect.logInfo(`Rental returned: id=${rentalId}, lateFee=${result.lateFee}`);
        return result;
      }),

      // Get rental details
      getRentalById: Effect.fn("RentalService.getRentalById")(function* (rentalId: RentalId) {
        yield* Effect.logDebug(`Getting rental: ${rentalId}`);
        return yield* rentalRepo.findById(rentalId);
      }),

      // Get customer rental history
      getCustomerRentals: Effect.fn("RentalService.getCustomerRentals")(function* (customerId: CustomerId, limit: number = 20) {
        yield* Effect.logDebug(`Getting rentals for customer: ${customerId}`);
        return yield* rentalRepo.getCustomerRentals(customerId, limit);
      }),

      // Get customer info
      getCustomer: Effect.fn("RentalService.getCustomer")(function* (customerId: CustomerId) {
        yield* Effect.logDebug(`Getting customer: ${customerId}`);
        return yield* rentalRepo.getCustomer(customerId);
      }),
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide([RentalRepository.layer, InventoryRepository.layer, PaymentRepository.layer, RentalPolicy.layer]),
  );
}
