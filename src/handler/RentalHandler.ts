import { HttpApiBuilder } from "effect/http-api";
import { Effect } from "effect";
import { Api, RentalNotFoundError as ApiRentalNotFoundError, CustomerNotFoundError as ApiCustomerNotFoundError, NoInventoryError, RentalError } from "../api/index.js";
import { RentalService } from "../service/RentalService.js";
import { CreateRentalInput } from "../schema/Rental.js";
import { requireStaff, requireAuth } from "../middleware/auth.js";
import { RentalId, CustomerId } from "../schema/Ids.js";

// ============================================================
// Rental Handler Implementation
// ============================================================

export const RentalHandler = HttpApiBuilder.group(Api, "rentals", (handlers) =>
  handlers
    // Protected: Staff only - create rental
    .handle("create", ({ payload }) =>
      Effect.gen(function* () {
        yield* requireStaff;
        
        const rentalService = yield* RentalService;
        
        const input = new CreateRentalInput({
          filmId: payload.filmId,
          customerId: payload.customerId,
          storeId: payload.storeId,
          staffId: payload.staffId,
        });

        return yield* rentalService.createRental(input);
      }).pipe(
        Effect.mapError((err: any) => {
          if (err instanceof Error && err.message.includes("Authorization")) {
            return new RentalError({ message: "Staff authentication required" });
          }
          if (err._tag === "CustomerNotFoundError") {
            return new ApiCustomerNotFoundError({ 
              message: `Customer ${payload.customerId} not found`, 
              customerId: payload.customerId 
            });
          }
          if (err._tag === "CustomerInactiveError") {
            return new ApiCustomerNotFoundError({ 
              message: `Customer ${payload.customerId} is inactive`, 
              customerId: payload.customerId 
            });
          }
          if (err._tag === "NoInventoryAvailableError") {
            return new NoInventoryError({ 
              message: `No available inventory for film ${payload.filmId} at store ${payload.storeId}`, 
              filmId: payload.filmId, 
              storeId: payload.storeId 
            });
          }
          const msg = err instanceof Error ? err.message : String(err);
          return new RentalError({ message: msg || "Failed to create rental" });
        })
      )
    )
    // Protected: Staff only - return rental
    .handle("return", ({ params }) =>
      Effect.gen(function* () {
        yield* requireStaff;
        
        const rentalService = yield* RentalService;
        return yield* rentalService.returnRental(params.rentalId as RentalId);
      }).pipe(
        Effect.mapError((err: any) => {
          if (err instanceof Error && err.message.includes("Authorization")) {
            return new RentalError({ message: "Staff authentication required" });
          }
          if (err._tag === "RentalNotFoundError") {
            return new ApiRentalNotFoundError({ message: `Rental ${params.rentalId} not found`, rentalId: params.rentalId });
          }
          if (err._tag === "RentalAlreadyReturnedError") {
            return new RentalError({ message: `Rental ${params.rentalId} already returned` });
          }
          const msg = err instanceof Error ? err.message : String(err);
          return new RentalError({ message: msg || "Failed to return rental" });
        })
      )
    )
    // Protected: requires authentication
    .handle("getById", ({ params }) =>
      Effect.gen(function* () {
        yield* requireAuth;
        
        const rentalService = yield* RentalService;
        const rental = yield* rentalService.getRentalById(params.rentalId as RentalId);

        if (!rental) {
          return yield* Effect.fail(
            new ApiRentalNotFoundError({ message: "Rental not found", rentalId: params.rentalId })
          );
        }

        return rental;
      }).pipe(
        Effect.mapError(() =>
          new ApiRentalNotFoundError({ message: "Rental not found", rentalId: params.rentalId })
        )
      )
    )
    // Protected: Customer can view own rentals, Staff can view any
    .handle("customerRentals", ({ params }) =>
      Effect.gen(function* () {
        const user = yield* requireAuth;
        
        // Customer can only view their own rentals
        if (user.type === "customer" && user.id !== params.customerId) {
          return yield* Effect.fail(new RentalError({ message: "Access denied" }));
        }
        
        const rentalService = yield* RentalService;
        return yield* rentalService.getCustomerRentals(params.customerId as CustomerId);
      }).pipe(
        Effect.mapError((err: any) => {
          if (err instanceof Error && err.message.includes("Authorization")) {
            return new RentalError({ message: "Authentication required" });
          }
          if (err._tag === "RentalError") return err;
          return new ApiCustomerNotFoundError({ message: "Customer not found", customerId: params.customerId });
        })
      )
    )
    // Protected: Requires authentication
    .handle("customerInfo", ({ params }) =>
      Effect.gen(function* () {
        const user = yield* requireAuth;
        
        // Customer can only view their own info
        if (user.type === "customer" && user.id !== params.customerId) {
          return yield* Effect.fail(new RentalError({ message: "Access denied" }));
        }
        
        const rentalService = yield* RentalService;
        const customer = yield* rentalService.getCustomer(params.customerId as CustomerId);

        if (!customer) {
          return yield* Effect.fail(
            new ApiCustomerNotFoundError({ message: "Customer not found", customerId: params.customerId })
          );
        }

        return customer;
      }).pipe(
        Effect.mapError((err: any) => {
          if (err instanceof Error && err.message.includes("Authorization")) {
            return new RentalError({ message: "Authentication required" });
          }
          if (err._tag === "RentalError") return err;
          return new ApiCustomerNotFoundError({ message: "Customer not found", customerId: params.customerId });
        })
      )
    )
);
