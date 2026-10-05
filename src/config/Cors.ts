import { HttpRouter } from "effect/http"

// ============================================================
// CORS Configuration
// ============================================================

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
]

export const CorsLive = HttpRouter.cors({
  allowedOrigins: ALLOWED_ORIGINS,
  allowedMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
})

// Export for logging
export const allowedOrigins = ALLOWED_ORIGINS
