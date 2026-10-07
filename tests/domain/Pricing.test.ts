import { describe, it, expect } from "bun:test";
import { priceBasket, threeForTwo, lateFeeCents, toCents, PriceLine, PricingRule } from "../../src/domain/Pricing.js";
import { FilmId } from "../../src/schema/Ids.js";

const line = (filmId: number, cents: number): PriceLine => ({
  filmId: filmId as FilmId,
  filmTitle: `Film ${filmId}`,
  rentalRateCents: cents,
});

describe("Pricing", () => {
  it("charges full price below three discs", () => {
    const basket = priceBasket([line(1, 499), line(2, 99)]);
    expect(basket.subtotalCents).toBe(598);
    expect(basket.discountCents).toBe(0);
    expect(basket.totalCents).toBe(598);
    expect(basket.lines.every((l) => l.promotion === null)).toBe(true);
  });

  it("makes the cheapest of three discs free, wherever it is in the basket", () => {
    const basket = priceBasket([line(1, 99), line(2, 499), line(3, 299)]);
    expect(basket.lines.map((l) => l.totalCents)).toEqual([0, 499, 299]);
    expect(basket.lines[0]?.promotion).toBe("3 for 2");
    expect(basket.discountCents).toBe(99);
    expect(basket.totalCents).toBe(798);
  });

  it("gives one free disc per full group of three, ranked by price", () => {
    // Ranked: 499, 499, 299 | 299, 99, 99 | 99 → free: 299 (rank 2) and 99 (rank 5)
    const basket = priceBasket([line(1, 99), line(2, 299), line(3, 499), line(4, 99), line(5, 299), line(6, 499), line(7, 99)]);
    expect(basket.discountCents).toBe(299 + 99);
    expect(basket.lines.filter((l) => l.discountCents > 0)).toHaveLength(2);
  });

  it("frees the first-listed disc when prices tie", () => {
    const discounts = threeForTwo([line(1, 299), line(2, 299), line(3, 299)]);
    expect(discounts).toEqual([{ index: 2, discountCents: 299, promotion: "3 for 2" }]);
  });

  it("never discounts a line below zero when promotions stack", () => {
    const halfOff: PricingRule = (lines) =>
      lines.map((l, index) => ({ index, discountCents: Math.round(l.rentalRateCents / 2), promotion: "half off" }));
    const basket = priceBasket([line(1, 499), line(2, 299), line(3, 99)], [threeForTwo, halfOff]);
    const free = basket.lines[2]!;
    expect(free.discountCents).toBe(99);
    expect(free.totalCents).toBe(0);
    expect(free.promotion).toBe("3 for 2, half off");
    expect(basket.totalCents).toBe(basket.lines.reduce((s, l) => s + l.totalCents, 0));
  });

  it("converts decimal amounts to cents without float drift", () => {
    expect(toCents("4.99")).toBe(499);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it("charges one rental rate per day late", () => {
    expect(lateFeeCents(3, 5, 299)).toBe(0);
    expect(lateFeeCents(5, 5, 299)).toBe(0);
    expect(lateFeeCents(8, 5, 299)).toBe(897);
  });
});
