import { Config, Context, Effect, Layer } from "effect";
import { CustomerId } from "../schema/Ids.js";
import { RentalIneligibility } from "../schema/Checkout.js";
import { toCents } from "./Pricing.js";

// ============================================================
// Rental eligibility rules
// ============================================================

export interface CustomerStanding {
  readonly customerId: CustomerId;
  readonly isActive: boolean;
  readonly openRentals: number;
  readonly overdueRentals: number;
  readonly balanceCents: number;
}

export interface RentalPolicyConfig {
  /** Discs a customer may have out at once, including the ones being rented now */
  readonly maxOpenRentals: number;
  /** Highest outstanding balance at which a customer may still rent */
  readonly maxBalanceCents: number;
}

export class RentalPolicy extends Context.Service<RentalPolicy, RentalPolicyConfig>()("RentalPolicy") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const maxOpenRentals = yield* Config.Int("RENTAL_MAX_OPEN_RENTALS").pipe(Config.withDefault(5));
      const maxBalance = yield* Config.Number("RENTAL_MAX_BALANCE").pipe(Config.withDefault(10));
      return { maxOpenRentals, maxBalanceCents: toCents(maxBalance) };
    }),
  );
}

/**
 * Every rule the customer breaks, not just the first, so staff can resolve
 * them all in one go. An empty array means the customer may rent.
 */
export const checkEligibility = (
  standing: CustomerStanding,
  requested: number,
  policy: RentalPolicyConfig,
): ReadonlyArray<RentalIneligibility> => {
  const reasons: Array<RentalIneligibility> = [];

  if (!standing.isActive) {
    reasons.push({ code: "ACCOUNT_INACTIVE", message: "Customer account is inactive" });
  }
  if (standing.overdueRentals > 0) {
    reasons.push({
      code: "OVERDUE_RENTALS",
      message: `Customer has ${standing.overdueRentals} overdue rental(s) that must be returned first`,
    });
  }
  if (standing.balanceCents > policy.maxBalanceCents) {
    reasons.push({
      code: "BALANCE_LIMIT_EXCEEDED",
      message: `Outstanding balance ${(standing.balanceCents / 100).toFixed(2)} exceeds the limit of ${(policy.maxBalanceCents / 100).toFixed(2)}`,
    });
  }
  if (standing.openRentals + requested > policy.maxOpenRentals) {
    reasons.push({
      code: "RENTAL_LIMIT_EXCEEDED",
      message: `Customer has ${standing.openRentals} rental(s) out; renting ${requested} more would exceed the limit of ${policy.maxOpenRentals}`,
    });
  }

  return reasons;
};
