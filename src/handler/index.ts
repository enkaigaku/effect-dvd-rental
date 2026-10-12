import { HttpApiBuilder, HttpApiSwagger } from "effect/http-api"
import { Layer } from "effect"
import { Api } from "../api/index.js"
import { HealthHandler } from "./health.js"
import { FilmHandler } from "./FilmHandler.js"
import { InventoryHandler } from "./InventoryHandler.js"
import { RentalHandler } from "./RentalHandler.js"
import { CheckoutHandler } from "./CheckoutHandler.js"
import { PaymentHandler } from "./PaymentHandler.js"
import { CustomerAuthHandler } from "./CustomerAuthHandler.js"
import { StaffAuthHandler } from "./StaffAuthHandler.js"

// ============================================================
// API Implementation Layer
// ============================================================

export const ApiLive = HttpApiBuilder.layer(Api).pipe(
  Layer.provide([
    HealthHandler,
    FilmHandler,
    InventoryHandler,
    RentalHandler,
    CheckoutHandler,
    PaymentHandler,
    CustomerAuthHandler,
    StaffAuthHandler,
  ]),
)

// ============================================================
// OpenAPI Swagger UI
// ============================================================

export const DocsLive = HttpApiSwagger.layer(Api, { path: "/docs" })
