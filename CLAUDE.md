# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个使用 Effect-ts 构建的 DVD 租赁 API 应用，采用分层架构，使用 Pagila 示例数据库 (PostgreSQL)，支持顾客和员工的 JWT 认证，集成 OpenTelemetry 分布式追踪。运行时为 Bun。

**核心功能**：
- Film 查询（分页、搜索、演员信息）
- Category 和 Store 管理
- Rental 租赁流程（创建、归还）
- Payment 支付管理
- Customer/Staff 认证与权限控制
- 健康检查 (Health Check)
- OpenAPI 文档 (Swagger UI at `/docs`)
- Rate Limiting 和 CORS 支持
- OpenTelemetry Jaeger 追踪

## 常用命令

```bash
# 启动开发服务器 (热重载)
bun dev

# 类型检查
bun check

# 运行测试
bun test

# 运行单个测试文件
bun test tests/service/RentalService.test.ts

# 运行测试并查看覆盖率
bun test --coverage

# 构建生产版本
bun build

# 启动数据库和 Jaeger (需要 Docker)
bun db:up

# 关闭数据库和 Jaeger
bun db:down

# 运行数据库迁移
bun migrate

# 启动生产服务器
bun start

# Docker 构建和运行
bun docker:build
bun docker:run
```

## 架构

### 分层结构

```
src/
├── main.ts           # 应用入口，组合所有 Layer
├── api/              # API 定义层 (HttpApiGroup + Schema)
│   ├── HealthApi.ts
│   ├── FilmApi.ts
│   ├── InventoryApi.ts
│   ├── RentalApi.ts
│   ├── PaymentApi.ts
│   ├── CustomerAuthApi.ts
│   ├── StaffAuthApi.ts
│   └── index.ts
├── handler/          # 路由处理层 (HttpApiBuilder.group)
│   ├── health.ts
│   ├── FilmHandler.ts
│   ├── InventoryHandler.ts
│   ├── RentalHandler.ts
│   ├── PaymentHandler.ts
│   ├── CustomerAuthHandler.ts
│   ├── StaffAuthHandler.ts
│   └── index.ts
├── service/          # 业务逻辑层 (Effect.Service)
│   ├── FilmService.ts
│   ├── InventoryService.ts
│   ├── RentalService.ts
│   ├── PaymentService.ts
│   ├── CustomerAuthService.ts
│   └── StaffAuthService.ts
├── repository/       # 数据访问层 (SqlClient)
│   ├── FilmRepository.ts
│   ├── InventoryRepository.ts
│   ├── RentalRepository.ts
│   └── PaymentRepository.ts
├── schema/           # 数据模型 (Schema.Class)
│   ├── Common.ts
│   ├── Ids.ts        # Branded ID 类型 (FilmId, CustomerId, ...)
│   ├── Film.ts
│   ├── Category.ts
│   ├── Actor.ts
│   ├── Inventory.ts
│   ├── Store.ts
│   ├── Rental.ts
│   ├── Customer.ts
│   └── Payment.ts
├── middleware/       # 中间件
│   └── auth.ts       # JWT 验证 (requireAuth, requireCustomer, requireStaff)
├── config/           # 配置层 (各种 Live Layer)
│   ├── AppConfig.ts  # Effect Config 定义 (Server/Log/RateLimiter 等)
│   ├── Database.ts   # DatabaseLive (PgClient)
│   ├── Server.ts     # ServerLive (BunHttpServer)
│   ├── Logger.ts     # LoggerLive
│   ├── Telemetry.ts  # TracingLive (OpenTelemetry)
│   ├── Cors.ts       # CorsLive
│   ├── RateLimiter.ts# RateLimiterLive
│   └── Services.ts   # ServicesLive (组合所有服务)
└── scripts/          # 脚本
    └── migrate.ts    # 数据库迁移脚本

tests/                # 测试 (根目录，不与源码放在一起)
├── api/              # 对 localhost:8080 的黑盒 API 测试 (需运行服务器和数据库)
├── repository/       # Repository 测试 (需数据库)
├── service/          # Service 单元测试 (mock Repository，无需数据库)
└── utils/            # 测试工具 (api.ts, auth.ts, testDb.ts)

migrations/           # SQL 迁移文件 (根目录)
├── 001_initial_schema.sql
├── 002_pagila_schema.sql
├── 003_pagila_data.sql
├── 005_customer_auth.sql
└── 006_staff_auth.sql
```

### Layer 依赖图

```
HttpLive (main.ts)
├── CorsLive
├── RateLimiterLive
├── DocsLive (Swagger UI at /docs)
├── ApiLive
│   ├── HealthHandler
│   ├── FilmHandler
│   ├── InventoryHandler
│   ├── RentalHandler
│   ├── PaymentHandler
│   ├── CustomerAuthHandler
│   └── StaffAuthHandler
├── ServicesLive
│   ├── FilmService.Default
│   │   └── FilmRepository.Default → DatabaseLive
│   ├── InventoryService.Default
│   │   └── InventoryRepository.Default → DatabaseLive
│   ├── RentalService.Default
│   │   ├── RentalRepository.Default → DatabaseLive
│   │   └── InventoryRepository.Default → DatabaseLive
│   ├── PaymentService.Default
│   │   └── PaymentRepository.Default → DatabaseLive
│   ├── CustomerAuthService.Default → DatabaseLive
│   └── StaffAuthService.Default → DatabaseLive
├── ServerLive (BunHttpServer)
├── TracingLive (OpenTelemetry + Jaeger)
└── LoggerLive

DatabaseLive: PgClient 连接池配置
```

### Effect-ts 模式

**Service 定义**：使用 `Effect.Service` 模式定义服务
```typescript
export class FilmService extends Effect.Service<FilmService>()("FilmService", {
  effect: Effect.gen(function* () {
    const repo = yield* FilmRepository;
    return {
      getFilmById: (filmId: number) => Effect.gen(function* () {
        yield* Effect.logDebug(`Getting film by ID: ${filmId}`);
        return yield* repo.findById(filmId);
      }),
      searchFilms: (params: FilmSearchParams) => repo.search(params),
      // ...
    };
  }),
  dependencies: [FilmRepository.Default],
}) {}
```

**错误类型**：使用 `Schema.TaggedError` 定义 API 错误
```typescript
// API 错误 (带 HTTP 状态码和描述)
export class FilmNotFoundError extends Schema.TaggedError<FilmNotFoundError>()(
  "FilmNotFoundError",
  {
    filmId: Schema.Number,
    message: Schema.String,
  },
  HttpApiSchema.annotations({
    status: 404,
    description: "Film not found",
  }),
) {}

// 认证错误
export class InvalidCredentialsError extends Schema.TaggedError<InvalidCredentialsError>()(
  "InvalidCredentialsError",
  { message: Schema.String },
  HttpApiSchema.annotations({ status: 401 }),
) {}
```

**API 定义**：使用 `HttpApiGroup` + `HttpApiEndpoint`
```typescript
export class FilmApi extends HttpApiGroup.make("films")
  .add(
    HttpApiEndpoint.get("getFilmById", "/films/:id")
      .setPath(Schema.Struct({ id: Schema.NumberFromString }))
      .addSuccess(Film)
      .addError(FilmNotFoundError)
  )
  .add(
    HttpApiEndpoint.get("searchFilms", "/films")
      .setUrlParams(FilmSearchParams)
      .addSuccess(FilmListResponse)
  ) {}
```

**Handler 实现**：使用 `HttpApiBuilder.group`
```typescript
export const FilmHandler = HttpApiBuilder.group(Api, "films", (handlers) =>
  Effect.gen(function* () {
    const filmService = yield* FilmService;
    return handlers
      .handle("getFilmById", ({ path }) =>
        Effect.gen(function* () {
          const film = yield* filmService.getFilmById(path.id);
          if (!film) {
            return yield* new FilmNotFoundError({
              filmId: path.id,
              message: `Film ${path.id} not found`,
            });
          }
          return film;
        })
      )
      .handle("searchFilms", ({ urlParams }) =>
        filmService.searchFilms(urlParams)
      );
  })
);
```

**中间件**：JWT 认证辅助函数 (`src/middleware/auth.ts`)

- `requireAuth`：校验 Bearer token，返回 `AuthUser`
- `requireCustomer` / `requireStaff`：在 `requireAuth` 基础上校验角色
- `withAuth(effect)`：为需要 `CurrentUser` 的 effect 提供已认证用户

在 Handler 中 `yield*` 调用：
```typescript
import { requireCustomer, requireStaff } from "../middleware/auth.js";

// Staff only
.handle("create", ({ payload }) =>
  Effect.gen(function* () {
    yield* requireStaff;
    const rentalService = yield* RentalService;
    // ...
  })
)

// Customer only，且只能访问自己的数据
.handle("profile", ({ path }) =>
  Effect.gen(function* () {
    const authUser = yield* requireCustomer;
    if (authUser.id !== path.customerId) {
      return yield* Effect.fail(new CustomerAuthError({ message: "Access denied" }));
    }
    // ...
  })
)
```

### 测试模式

测试文件放在根目录 `tests/` 下。Service 测试使用 `bun:test` + `Layer.succeed` 模拟依赖 (参见 `tests/service/RentalService.test.ts`)：
```typescript
import { describe, test, expect } from "bun:test";
import { Effect, Layer } from "effect";
import { FilmService } from "../../src/service/FilmService.js";
import { FilmRepository } from "../../src/repository/FilmRepository.js";

describe("FilmService", () => {
  test("should get film by id", async () => {
    const mockFilm = { filmId: 1, title: "Test Film", ... };

    const MockRepo = Layer.succeed(FilmRepository, FilmRepository.of({
      _tag: "FilmRepository",
      findById: (id: number) => Effect.succeed(mockFilm),
      search: () => Effect.succeed({ items: [mockFilm], total: 1 }),
      // ...
    }));

    const program = Effect.gen(function* () {
      const service = yield* FilmService;
      return yield* service.getFilmById(1);
    });

    const result = await program.pipe(
      Effect.provide(FilmService.Default),
      Effect.provide(MockRepo),
      Effect.runPromise
    );

    expect(result).toEqual(mockFilm);
  });
});
```

### 数据库迁移

SQL 迁移文件放在根目录 `migrations/` 目录，按文件名排序执行。运行 `bun migrate` 应用迁移。

**迁移文件命名规范**：`{序号}_{描述}.sql`
- `001_initial_schema.sql` - 基础表结构
- `002_pagila_schema.sql` - Pagila 数据库 schema
- `003_pagila_data.sql` - 初始数据
- `005_customer_auth.sql` - 顾客认证相关表
- `006_staff_auth.sql` - 员工认证相关表

迁移脚本会自动创建 `migrations` 表来追踪已执行的迁移。

## 环境变量

参见 `.env.example`。关键配置：

### Server
- `PORT`: 服务器端口 (默认: 8080)

### Database
- `DB_HOST`: 数据库主机 (默认: localhost)
- `DB_PORT`: 数据库端口 (默认: 5432)
- `DB_NAME`: 数据库名称 (默认: effect_crud)
- `DB_USER`: 数据库用户名
- `DB_PASSWORD`: 数据库密码
- `DB_POOL_MIN`: 连接池最小连接数 (默认: 1)
- `DB_POOL_MAX`: 连接池最大连接数 (默认: 10)

### JWT Authentication
- `JWT_SECRET`: JWT 签名密钥 (**生产环境必须修改！**)
- `JWT_EXPIRES_IN`: Token 过期时间 (如: 1h, 30m, 7d)

### Logging
- `LOG_LEVEL`: 日志级别
  - 可选值: `trace` | `debug` | `info` | `warning` | `error` | `fatal` | `none`
  - 默认: `info`

### OpenTelemetry
- `OTEL_EXPORTER_OTLP_ENDPOINT`: OpenTelemetry 导出端点 (默认: http://localhost:4318)

## API 端点

参见 `src/main.ts:41-49` 中的端点列表或访问 http://localhost:8080/docs 查看 Swagger 文档。

**核心端点**：
- Health: `GET /health`, `GET /ready`
- Films: `GET /films`, `GET /films/:id`, `GET /films/:id/actors`, `GET /films/:id/availability`
- Categories: `GET /categories`
- Stores: `GET /stores`, `GET /stores/:id`, `GET /stores/:storeId/films/:filmId/availability`
- Rentals: `POST /rentals`, `PUT /rentals/:id/return`, `GET /customers/:id/rentals`
- Payments: `POST /payments`, `GET /payments/:id`, `GET /customers/:id/payments`, `GET /customers/:id/balance`
- Customer Auth: `POST /customer/login`, `POST /customer/register`, `GET /customer/profile/:id`
- Staff Auth: `POST /staff/login`, `GET /staff`, `GET /staff/profile/:id`

**认证**：
- Customer 和 Staff 端点需要 `Authorization: Bearer <token>` header
- 默认密码均为 `changeme`

## 开发提示

1. **添加新功能模块**时，按顺序创建：
   - `schema/` - 定义数据模型和错误类型
   - `api/` - 定义 API 端点
   - `repository/` - 实现数据访问层
   - `service/` - 实现业务逻辑
   - `handler/` - 实现路由处理
   - 更新 `config/Services.ts` 注册新服务
   - 更新 `handler/index.ts` 和 `api/index.ts` 导出新模块

2. **数据库查询**使用 `@effect/sql` 的 `SqlClient`：
   ```typescript
   const sql = yield* SqlClient.SqlClient;
   const result = yield* sql`SELECT * FROM films WHERE film_id = ${filmId}`;
   ```

3. **日志记录**使用 Effect 内置日志：
   ```typescript
   yield* Effect.logDebug("Debug message");
   yield* Effect.logInfo("Info message");
   yield* Effect.logWarning("Warning message");
   yield* Effect.logError("Error message");
   ```

4. **OpenTelemetry 追踪**：
   - 启动 Jaeger: `bun db:up`
   - 访问 http://localhost:16686 查看追踪信息
   - Trace 会自动记录所有 Effect 操作
