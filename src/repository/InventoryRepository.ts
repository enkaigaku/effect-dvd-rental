import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { FilmAvailability } from "../schema/Inventory.js";
import { StoreWithAddress } from "../schema/Store.js";
import { FilmId, StoreId, InventoryId } from "../schema/Ids.js";

// ============================================================
// Inventory Repository
// ============================================================

export class InventoryRepository extends Context.Service<InventoryRepository>()("InventoryRepository", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    return {
      // Check film availability at a specific store
      getFilmAvailability: (filmId: FilmId, storeId: StoreId) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT 
              f.film_id,
              f.title as film_title,
              i.store_id,
              COUNT(i.inventory_id) as total_copies,
              COUNT(i.inventory_id) FILTER (
                WHERE inventory_in_stock(i.inventory_id)
              ) as available_copies
            FROM film f
            LEFT JOIN inventory i ON f.film_id = i.film_id AND i.store_id = ${storeId}
            WHERE f.film_id = ${filmId}
            GROUP BY f.film_id, f.title, i.store_id
          `;

          if (!rows[0]) return undefined;

          const row = rows[0] as any;
          return new FilmAvailability({
            filmId: row.film_id,
            filmTitle: row.film_title,
            storeId: row.store_id ?? storeId,
            totalCopies: Number(row.total_copies ?? 0),
            availableCopies: Number(row.available_copies ?? 0),
          });
        }),

      // Get all available inventory for a film across all stores
      getFilmAvailabilityAllStores: (filmId: FilmId) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT 
              f.film_id,
              f.title as film_title,
              i.store_id,
              COUNT(i.inventory_id) as total_copies,
              COUNT(i.inventory_id) FILTER (
                WHERE inventory_in_stock(i.inventory_id)
              ) as available_copies
            FROM film f
            LEFT JOIN inventory i ON f.film_id = i.film_id
            WHERE f.film_id = ${filmId}
            GROUP BY f.film_id, f.title, i.store_id
            ORDER BY i.store_id
          `;

          return rows.map((row: any) => new FilmAvailability({
            filmId: row.film_id,
            filmTitle: row.film_title,
            storeId: row.store_id,
            totalCopies: Number(row.total_copies ?? 0),
            availableCopies: Number(row.available_copies ?? 0),
          }));
        }),

      // Find an available inventory item for rental
      findAvailableInventory: (filmId: FilmId, storeId: StoreId) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT inventory_id
            FROM inventory
            WHERE film_id = ${filmId}
              AND store_id = ${storeId}
              AND inventory_in_stock(inventory_id)
            LIMIT 1
          `;

          return rows[0]?.["inventory_id"] as InventoryId | undefined;
        }),

      // Pick an available copy and lock it for the rest of the transaction.
      // SKIP LOCKED lets concurrent checkouts of the same film each take a
      // different copy instead of queueing on (or double-renting) the same one.
      // Must run inside a transaction, otherwise the lock is released at once.
      reserveAvailableInventory: (filmId: FilmId, storeId: StoreId) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT inventory_id
            FROM inventory
            WHERE film_id = ${filmId}
              AND store_id = ${storeId}
              AND inventory_in_stock(inventory_id)
            ORDER BY inventory_id
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          `;

          return rows[0]?.["inventory_id"] as InventoryId | undefined;
        }),

      // Get all stores with address info
      getStores: () =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT 
              s.store_id,
              a.address,
              c.city,
              co.country,
              CONCAT(st.first_name, ' ', st.last_name) as manager_name
            FROM store s
            JOIN address a ON s.address_id = a.address_id
            JOIN city c ON a.city_id = c.city_id
            JOIN country co ON c.country_id = co.country_id
            LEFT JOIN staff st ON s.manager_staff_id = st.staff_id
            ORDER BY s.store_id
          `;

          return rows.map((row: any) => new StoreWithAddress({
            storeId: row.store_id,
            address: row.address,
            city: row.city,
            country: row.country,
            managerName: row.manager_name,
          }));
        }),

      // Get store by ID
      getStoreById: (storeId: StoreId) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT 
              s.store_id,
              a.address,
              c.city,
              co.country,
              CONCAT(st.first_name, ' ', st.last_name) as manager_name
            FROM store s
            JOIN address a ON s.address_id = a.address_id
            JOIN city c ON a.city_id = c.city_id
            JOIN country co ON c.country_id = co.country_id
            LEFT JOIN staff st ON s.manager_staff_id = st.staff_id
            WHERE s.store_id = ${storeId}
          `;

          if (!rows[0]) return undefined;

          const row = rows[0] as any;
          return new StoreWithAddress({
            storeId: row.store_id,
            address: row.address,
            city: row.city,
            country: row.country,
            managerName: row.manager_name,
          });
        }),
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
