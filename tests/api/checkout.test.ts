import { describe, it, expect, beforeAll } from "bun:test";
import { API_BASE_URL, authPost, post } from "../utils/api.js";
import { generateCustomerToken, generateStaffToken } from "../utils/auth.js";

// ============================================================
// Checkout API Endpoint Tests (read-only: quotes and rejected checkouts)
// ============================================================

describe("Checkout API", () => {
  let staffStore1: string;
  let staffStore2: string;
  let customerToken: string;

  // Films 1, 4 and 7 have copies at store 1 and cost 0.99, 2.99 and 4.99
  const basket = { customerId: 1, storeId: 1, filmIds: [1, 4, 7] };

  beforeAll(async () => {
    staffStore1 = await generateStaffToken(1, "Mike", 1);
    staffStore2 = await generateStaffToken(2, "Jon", 2);
    customerToken = await generateCustomerToken(1);
  });

  describe("POST /checkout/quote", () => {
    it("prices the basket with the cheapest of three discs free", async () => {
      const { status, data } = await authPost<any>("/checkout/quote", basket, staffStore1);

      expect(status).toBe(200);
      expect(data.lines.map((l: any) => l.filmId)).toEqual([1, 4, 7]);
      expect(data.lines[0]).toMatchObject({ rentalRate: 0.99, discount: 0.99, amount: 0, promotion: "3 for 2" });
      expect(data.subtotal).toBe(8.97);
      expect(data.discount).toBe(0.99);
      expect(data.total).toBe(7.98);
    });

    it("returns 401 without a token and 403 for a customer token", async () => {
      expect((await post<any>("/checkout/quote", basket)).status).toBe(401);
      const { status, data } = await authPost<any>("/checkout/quote", basket, customerToken);
      expect(status).toBe(403);
      expect(data._tag).toBe("CheckoutForbiddenError");
    });

    it("returns 400 for an empty, oversized or duplicated basket", async () => {
      for (const filmIds of [[], [1, 1], Array.from({ length: 11 }, (_, i) => i + 1)]) {
        const res = await fetch(`${API_BASE_URL}/checkout/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${staffStore1}` },
          body: JSON.stringify({ ...basket, filmIds }),
        });
        expect(res.status).toBe(400);
      }
    });

    it("returns 404 listing every unknown film", async () => {
      const { status, data } = await authPost<any>("/checkout/quote", { ...basket, filmIds: [1, 99998, 99999] }, staffStore1);
      expect(status).toBe(404);
      expect(data._tag).toBe("FilmsNotFoundError");
      expect(data.filmIds).toEqual([99998, 99999]);
    });

    it("returns 409 listing every film with no copy at the store", async () => {
      // Films 2 and 3 have no copies at store 1
      const { status, data } = await authPost<any>("/checkout/quote", { ...basket, filmIds: [1, 2, 3] }, staffStore1);
      expect(status).toBe(409);
      expect(data._tag).toBe("FilmsUnavailableError");
      expect(data.filmIds).toEqual([2, 3]);
    });

    it("returns 422 with the reasons for a customer with overdue rentals", async () => {
      // Customer 155 still has rentals out from 2022
      const { status, data } = await authPost<any>("/checkout/quote", { ...basket, customerId: 155 }, staffStore1);
      expect(status).toBe(422);
      expect(data._tag).toBe("CustomerNotEligibleError");
      expect(data.reasons.map((r: any) => r.code)).toContain("OVERDUE_RENTALS");
    });
  });

  describe("POST /checkout", () => {
    it("returns 403 when staff check out at another store", async () => {
      const { status, data } = await authPost<any>("/checkout", basket, staffStore2);
      expect(status).toBe(403);
      expect(data._tag).toBe("CheckoutForbiddenError");
    });

    it("returns 422 and rents nothing for an ineligible customer", async () => {
      const { status, data } = await authPost<any>("/checkout", { ...basket, customerId: 155 }, staffStore1);
      expect(status).toBe(422);
      expect(data._tag).toBe("CustomerNotEligibleError");
    });
  });
});
