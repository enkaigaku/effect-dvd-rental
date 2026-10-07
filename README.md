# DVD Rental API

A complete DVD rental backend service built with **Effect-ts**, **PostgreSQL (Pagila)**, and **Bun** runtime.

## Features

- **Effect-ts** - Functional programming with type-safe error handling
- **Pagila Database** - Standard DVD rental sample database
- **JWT Authentication** - Customer and Staff authentication
- **OpenAPI** - Auto-generated Swagger documentation at `/docs`
- **Rate Limiting** - Configurable request throttling per IP
- **CORS** - Cross-origin resource sharing support
- **OpenTelemetry** - Distributed tracing with Jaeger
- **Rental Rules** - Customers with overdue rentals, too many discs out or a balance over the limit cannot rent
- **Checkout** - Rent several films and pay in one transaction, with promotions (3 for 2)
- **Late Fees** - Charged to the customer's balance when a rental comes back late
- **Database Migrations** - Version-controlled schema changes

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Language | TypeScript 7 |
| Framework | Effect-ts 4 (`effect/http-api`) |
| Database | PostgreSQL (Pagila), `effect/sql` + @effect/sql-pg |
| Auth | JWT (jose), bcrypt |
| Docs | OpenAPI 3.1, Swagger UI |
| Tracing | OpenTelemetry, Jaeger |
| Testing | Bun test |

## Project Structure

```
src/
├── api/           # API endpoint definitions
├── config/        # Server, CORS, RateLimiter, Database, Telemetry
├── domain/        # Pure business rules (pricing, rental eligibility)
├── handler/       # Route handlers
├── middleware/    # JWT auth middleware
├── repository/    # Data access layer
├── schema/        # Effect schemas
├── service/       # Business logic
└── main.ts        # Application entry point

tests/
├── api/           # API endpoint tests
├── domain/        # Business rule unit tests
├── repository/    # Integration tests
├── service/       # Unit tests
└── utils/         # Test utilities

migrations/        # SQL migration files
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) >= 1.0
- [Docker](https://www.docker.com/)

### Installation

```bash
# Install dependencies
bun install

# Start PostgreSQL & Jaeger
bun run db:up

# Run database migrations
bun run migrate

# Start development server
bun run dev
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start development server |
| `bun run check` | TypeScript type checking |
| `bun run build` | Bundle to `dist/` |
| `bun run test` | Run tests |
| `bun run migrate` | Run database migrations |
| `bun run db:up` | Start Docker containers |
| `bun run db:down` | Stop Docker containers |

## API Endpoints

### Public Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/films` | Search films |
| GET | `/films/:id` | Film details |
| GET | `/films/:id/actors` | Film actors |
| GET | `/categories` | All categories |
| GET | `/stores` | All stores |
| POST | `/customer/login` | Customer login |
| POST | `/customer/register` | Customer registration |
| POST | `/staff/login` | Staff login |

### Customer Routes (Bearer token required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/customer/profile/:id` | Get own profile |
| PUT | `/customer/password/:id` | Update own password |
| GET | `/customers/:id/rentals` | Own rental history |
| GET | `/customers/:id/payments` | Own payment history |
| GET | `/customers/:id/balance` | Own balance |

### Staff Routes (Bearer token required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/staff` | List all staff |
| GET | `/staff/profile/:id` | Get staff profile |
| PUT | `/staff/password/:id` | Update own password |
| POST | `/rentals` | Create rental (no payment) |
| PUT | `/rentals/:id/return` | Return rental; charges a late fee if overdue |
| POST | `/checkout/quote` | Price a basket of films and check it can be rented |
| POST | `/checkout` | Rent and pay for 1-10 films at the staff member's store, all or nothing |
| POST | `/payments` | Create payment |

## Authentication

```bash
# Customer login
curl -X POST http://localhost:8080/customer/login \
  -H "Content-Type: application/json" \
  -d '{"email":"MARY.SMITH@sakilacustomer.org","password":"changeme"}'

# Use token
curl -H "Authorization: Bearer <token>" http://localhost:8080/customer/profile/1
```

Default passwords:
- Customers: `changeme`
- Staff: `changeme`

## Documentation

- **Swagger UI**: http://localhost:8080/docs
- **Jaeger UI**: http://localhost:16686

## Testing

```bash
# Run all tests
bun test

# Run with coverage
bun test --coverage
```

## License

MIT
