import { Config, Redacted } from "effect"
import { PgClient } from "@effect/sql-pg"

// ============================================================
// Database Configuration from Environment Variables
// ============================================================

const DatabaseConfig = {
  host: Config.String("DB_HOST").pipe(Config.withDefault("localhost")),
  port: Config.Number("DB_PORT").pipe(Config.withDefault(5432)),
  database: Config.String("DB_NAME").pipe(Config.withDefault("effect_dvd_rental")),
  username: Config.String("DB_USER").pipe(Config.withDefault("postgres")),
  password: Config.Redacted("DB_PASSWORD").pipe(
    Config.withDefault(Redacted.make("postgres"))
  ),
  // Connection Pool Configuration
  minConnections: Config.Number("DB_POOL_MIN").pipe(Config.withDefault(1)),
  maxConnections: Config.Number("DB_POOL_MAX").pipe(Config.withDefault(10)),
}

// ============================================================
// PostgreSQL Connection Pool Layer
// Uses layerConfig to properly handle Config types
// ============================================================

export const DatabaseLive = PgClient.layerConfig(DatabaseConfig)
