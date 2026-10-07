import { FilmId } from "../schema/Ids.js";

// ============================================================
// Checkout pricing
// ============================================================
// Pure functions over integer cents, so totals never pick up float error.

export interface PriceLine {
  readonly filmId: FilmId;
  readonly filmTitle: string;
  readonly rentalRateCents: number;
}

export interface LineDiscount {
  readonly index: number;
  readonly discountCents: number;
  readonly promotion: string;
}

export interface PricedLine extends PriceLine {
  readonly discountCents: number;
  readonly totalCents: number;
  readonly promotion: string | null;
}

export interface PricedBasket {
  readonly lines: ReadonlyArray<PricedLine>;
  readonly subtotalCents: number;
  readonly discountCents: number;
  readonly totalCents: number;
}

/** A promotion looks at the whole basket and returns discounts for some of its lines. */
export type PricingRule = (lines: ReadonlyArray<PriceLine>) => ReadonlyArray<LineDiscount>;

export const toCents = (amount: number | string): number => Math.round(Number(amount) * 100);
export const fromCents = (cents: number): number => cents / 100;

/**
 * 3 for 2: in every group of three discs the cheapest one is free. Lines are
 * ranked by price (most expensive first) so the customer always gets the
 * cheapest disc of each group of three for free.
 */
export const threeForTwo: PricingRule = (lines) =>
  lines
    .map((line, index) => ({ index, cents: line.rentalRateCents }))
    .sort((a, b) => b.cents - a.cents || a.index - b.index)
    .filter((_, rank) => rank % 3 === 2)
    .map(({ index, cents }) => ({ index, discountCents: cents, promotion: "3 for 2" }));

export const defaultPricingRules: ReadonlyArray<PricingRule> = [threeForTwo];

export const priceBasket = (
  lines: ReadonlyArray<PriceLine>,
  rules: ReadonlyArray<PricingRule> = defaultPricingRules,
): PricedBasket => {
  const discounts = lines.map(() => ({ cents: 0, promotions: [] as Array<string> }));
  for (const rule of rules) {
    for (const d of rule(lines)) {
      const slot = discounts[d.index];
      if (!slot || d.discountCents <= 0) continue;
      slot.cents += d.discountCents;
      slot.promotions.push(d.promotion);
    }
  }

  const priced = lines.map((line, i): PricedLine => {
    const slot = discounts[i]!;
    // Stacked promotions never make a line cost less than nothing
    const discountCents = Math.min(slot.cents, line.rentalRateCents);
    return {
      ...line,
      discountCents,
      totalCents: line.rentalRateCents - discountCents,
      promotion: slot.promotions.length > 0 ? slot.promotions.join(", ") : null,
    };
  });

  const subtotalCents = priced.reduce((sum, l) => sum + l.rentalRateCents, 0);
  const discountCents = priced.reduce((sum, l) => sum + l.discountCents, 0);
  return { lines: priced, subtotalCents, discountCents, totalCents: subtotalCents - discountCents };
};

/** Late fee: one rental_rate per day past the film's rental duration. */
export const lateFeeCents = (rentalDays: number, rentalDuration: number, rentalRateCents: number): number =>
  Math.max(0, rentalDays - rentalDuration) * rentalRateCents;
