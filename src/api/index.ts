import { HttpApi, OpenApi } from "effect/http-api"
import { HealthApi } from "./HealthApi.js"
import { FilmApi } from "./FilmApi.js"
import { InventoryApi } from "./InventoryApi.js"
import { RentalApi } from "./RentalApi.js"
import { CheckoutApi } from "./CheckoutApi.js"
import { PaymentApi } from "./PaymentApi.js"
import { CustomerAuthApi } from "./CustomerAuthApi.js"
import { StaffAuthApi } from "./StaffAuthApi.js"

// ============================================================
// Combined API Definition
// ============================================================

export const Api = HttpApi.make("Effect CRUD API")
  .add(HealthApi)
  .add(FilmApi)
  .add(InventoryApi)
  .add(RentalApi)
  .add(CheckoutApi)
  .add(PaymentApi)
  .add(CustomerAuthApi)
  .add(StaffAuthApi)
  .annotate(OpenApi.Title, "DVD Rental API")
  .annotate(OpenApi.Version, "1.0.0")
  .annotate(OpenApi.Description, "A DVD rental service built with Effect-ts, PostgreSQL, and JWT authentication")

// Re-export all API groups
export { HealthApi } from "./HealthApi.js"
export { FilmApi, FilmNotFoundError, DatabaseQueryError } from "./FilmApi.js"
export { InventoryApi, StoreNotFoundError, InventoryError } from "./InventoryApi.js"
export { RentalApi, RentalNotFoundError, CustomerNotFoundError, CustomerNotEligibleError, NoInventoryError, RentalError } from "./RentalApi.js"
export { CheckoutApi, CheckoutUnauthorizedError, CheckoutForbiddenError, FilmsNotFoundError, FilmsUnavailableError } from "./CheckoutApi.js"
export { PaymentApi, PaymentNotFoundError, InvalidPaymentError, PaymentError } from "./PaymentApi.js"
export { CustomerAuthApi, CustomerAuthError, CustomerEmailExistsError } from "./CustomerAuthApi.js"
export { StaffAuthApi, StaffAuthError } from "./StaffAuthApi.js"
