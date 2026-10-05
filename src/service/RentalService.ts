import { Context, Effect, Layer, Data } from "effect";
import { RentalRepository } from "../repository/RentalRepository.js";
import { InventoryRepository } from "../repository/InventoryRepository.js";
import { CreateRentalInput } from "../schema/Rental.js";
import { CustomerId, FilmId, StoreId, RentalId, StaffId } from "../schema/Ids.js";

// ============================================================
// Rental Service Errors (Data.TaggedError)
// ============================================================

export class CustomerNotFoundError extends Data.TaggedError("CustomerNotFoundError")<{
  readonly customerId: CustomerId;
}> {}

export class CustomerInactiveError extends Data.TaggedError("CustomerInactiveError")<{
  readonly customerId: CustomerId;
}> {}

export class NoInventoryAvailableError extends Data.TaggedError("NoInventoryAvailableError")<{
  readonly filmId: FilmId;
  readonly storeId: StoreId;
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

    return {
      // Create a new rental with validation
      createRental: Effect.fn("RentalService.createRental")(function* (input: CreateRentalInput) {
        yield* Effect.logInfo(
          `Creating rental: film=${input.filmId}, customer=${input.customerId}, store=${input.storeId}`,
        );

        // 1. Validate customer and find inventory in parallel
        const [customer, inventoryId] = yield* Effect.all(
          [
            rentalRepo.getCustomer(input.customerId),
            inventoryRepo.findAvailableInventory(input.filmId, input.storeId),
          ],
          { concurrency: "unbounded" },
        );

        if (!customer) {
          return yield* Effect.fail(new CustomerNotFoundError({ customerId: input.customerId }));
        }
        if (!customer.isActive) {
          return yield* Effect.fail(new CustomerInactiveError({ customerId: input.customerId }));
        }

        if (!inventoryId) {
          return yield* Effect.fail(
            new NoInventoryAvailableError({ filmId: input.filmId, storeId: input.storeId }),
          );
        }

        // 3. Create rental
        const rental = yield* rentalRepo.createRental(
          inventoryId,
          input.customerId,
          input.staffId ?? (1 as StaffId),
        );

        yield* Effect.logInfo(`Rental created: id=${rental.rentalId}`);
        return rental;
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
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide([RentalRepository.layer, InventoryRepository.layer]));
}
