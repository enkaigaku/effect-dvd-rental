import { Layer } from "effect"
import { FilmService } from "../service/FilmService.js"
import { InventoryService } from "../service/InventoryService.js"
import { RentalService } from "../service/RentalService.js"
import { PaymentService } from "../service/PaymentService.js"
import { CustomerAuthService } from "../service/CustomerAuthService.js"
import { StaffAuthService } from "../service/StaffAuthService.js"
import { DatabaseLive } from "./Database.js"

// ============================================================
// Application Services Layer
// ============================================================

// Layer dependency graph (each service layer provides its own repositories;
// layers are memoized, so InventoryRepository.layer is built once):
//   FilmService.layer → FilmRepository.layer → DatabaseLive
//   InventoryService.layer → InventoryRepository.layer → DatabaseLive
//   RentalService.layer → RentalRepository.layer + InventoryRepository.layer → DatabaseLive
//   PaymentService.layer → PaymentRepository.layer → DatabaseLive
//   CustomerAuthService.layer → DatabaseLive
//   StaffAuthService.layer → DatabaseLive

export const ServicesLive = Layer.mergeAll(
  FilmService.layer,
  InventoryService.layer,
  RentalService.layer,
  PaymentService.layer,
  CustomerAuthService.layer,
  StaffAuthService.layer
).pipe(Layer.provide(DatabaseLive))
