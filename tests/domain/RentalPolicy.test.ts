import { describe, it, expect } from "bun:test";
import { checkEligibility, CustomerStanding, RentalPolicyConfig } from "../../src/domain/RentalPolicy.js";
import { CustomerId } from "../../src/schema/Ids.js";

const policy: RentalPolicyConfig = { maxOpenRentals: 5, maxBalanceCents: 1000 };

const goodStanding: CustomerStanding = {
  customerId: 1 as CustomerId,
  isActive: true,
  openRentals: 0,
  overdueRentals: 0,
  balanceCents: 0,
};

const codes = (standing: Partial<CustomerStanding>, requested = 1) =>
  checkEligibility({ ...goodStanding, ...standing }, requested, policy).map((r) => r.code);

describe("RentalPolicy.checkEligibility", () => {
  it("allows a customer in good standing", () => {
    expect(codes({})).toEqual([]);
  });

  it("rejects an inactive account", () => {
    expect(codes({ isActive: false })).toEqual(["ACCOUNT_INACTIVE"]);
  });

  it("rejects a customer with any overdue rental", () => {
    expect(codes({ overdueRentals: 1, openRentals: 1 })).toEqual(["OVERDUE_RENTALS"]);
  });

  it("allows a balance up to the limit and rejects anything above it", () => {
    expect(codes({ balanceCents: 1000 })).toEqual([]);
    expect(codes({ balanceCents: 1001 })).toEqual(["BALANCE_LIMIT_EXCEEDED"]);
  });

  it("counts the discs being rented now toward the open-rental limit", () => {
    expect(codes({ openRentals: 2 }, 3)).toEqual([]);
    expect(codes({ openRentals: 3 }, 3)).toEqual(["RENTAL_LIMIT_EXCEEDED"]);
  });

  it("reports every broken rule at once", () => {
    expect(codes({ isActive: false, overdueRentals: 2, openRentals: 5, balanceCents: 5000 })).toEqual([
      "ACCOUNT_INACTIVE",
      "OVERDUE_RENTALS",
      "BALANCE_LIMIT_EXCEEDED",
      "RENTAL_LIMIT_EXCEEDED",
    ]);
  });
});
