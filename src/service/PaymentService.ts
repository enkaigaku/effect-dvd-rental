import { Context, Effect, Layer, Data } from "effect";
import { PaymentRepository } from "../repository/PaymentRepository.js";
import { CreatePaymentInput } from "../schema/Payment.js";
import { RentalId, CustomerId, PaymentId, StaffId } from "../schema/Ids.js";

// ============================================================
// Payment Service Errors
// ============================================================

export class RentalNotFoundError extends Data.TaggedError("RentalNotFoundError")<{
  readonly rentalId: RentalId;
}> {}

export class InvalidPaymentAmountError extends Data.TaggedError("InvalidPaymentAmountError")<{
  readonly amount: number;
}> {}

// ============================================================
// Payment Service
// ============================================================

export class PaymentService extends Context.Service<PaymentService>()("PaymentService", {
  make: Effect.gen(function* () {
    const repo = yield* PaymentRepository;

    return {
      // Create a payment
      createPayment: Effect.fn("PaymentService.createPayment")(function* (input: CreatePaymentInput) {
        yield* Effect.logInfo(`Creating payment: rental=${input.rentalId}, amount=${input.amount}`);

        if (input.amount <= 0) {
          return yield* Effect.fail(new InvalidPaymentAmountError({ amount: input.amount }));
        }

        const payment = yield* repo.createPayment(
          input.customerId,
          input.rentalId,
          input.amount,
          input.staffId ?? (1 as StaffId)
        );

        yield* Effect.logInfo(`Payment created: id=${payment.paymentId}`);
        return payment;
      }),

      // Get customer balance
      getCustomerBalance: Effect.fn("PaymentService.getCustomerBalance")(function* (customerId: CustomerId) {
        yield* Effect.logDebug(`Getting balance for customer: ${customerId}`);
        return yield* repo.getCustomerBalance(customerId);
      }),

      // Get customer payment history
      getCustomerPayments: Effect.fn("PaymentService.getCustomerPayments")(function* (customerId: CustomerId, limit: number = 20) {
        yield* Effect.logDebug(`Getting payments for customer: ${customerId}`);
        return yield* repo.getCustomerPayments(customerId, limit);
      }),

      // Get payment by ID
      getPaymentById: Effect.fn("PaymentService.getPaymentById")(function* (paymentId: PaymentId) {
        yield* Effect.logDebug(`Getting payment: ${paymentId}`);
        return yield* repo.findById(paymentId);
      }),
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(PaymentRepository.layer));
}
