# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个使用 Effect-ts 4 构建的 DVD 租赁 API 应用，采用分层架构，使用 Pagila 示例数据库 (PostgreSQL)，支持顾客和员工的 JWT 认证，集成 OpenTelemetry 分布式追踪。运行时为 Bun。

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

# 构建生产版本 (注意: `bun build` 是 Bun 内置打包命令，需用 `bun run build`)
bun run build

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

# API 快照 (需先 `bun migrate` 一个全新的库，并以高限流值启动服务)
RATE_LIMIT_MAX_REQUESTS=10000 bun src/main.ts
bun tests/snapshot/api-snapshot.ts snapshot-out
```

`tests/api/` 下的测试会请求 `localhost:8080`，运行 `bun test` 前需先启动服务。

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
├── service/          # 业务逻辑层 (Context.Service)
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
│   ├── Ids.ts        # Branded ID 类型
│   ├── Film.ts
│   ├── Category.ts
│   ├── Actor.ts
│   ├── Inventory.ts
│   ├── Store.ts
│   ├── Rental.ts
│   ├── Customer.ts
│   └── Payment.ts
├── middleware/       # 中间件
│   └── auth.ts       # JWT 验证 (requireAuth, requireCustomer, requireStaff, withAuth)
├── config/           # 配置层 (各种 Live Layer)
│   ├── Database.ts   # DatabaseLive (PgClient)
│   ├── Server.ts     # ServerLive (BunHttpServer)
│   ├── Logger.ts     # LoggerLive
│   ├── Telemetry.ts  # TracingLive (OpenTelemetry)
│   ├── Cors.ts       # CorsLive
│   ├── RateLimiter.ts# RateLimiterLive
│   └── Services.ts   # ServicesLive (组合所有服务)
└── scripts/          # 脚本
    ├── migrate.ts    # 数据库迁移脚本
    └── splitSqlStatements.ts # 将迁移文件拆分为单条语句

migrations/           # SQL 迁移文件 (根目录)
├── 001_initial_schema.sql
├── 002_pagila_schema.sql
├── 003_pagila_data.sql
├── 005_customer_auth.sql
└── 006_staff_auth.sql
```

### Layer 依赖图

```
app (main.ts)
├── LoggerLive / TracingLive (最外层提供，启动日志、服务器和所有请求共用)
└── HttpLive = HttpRouter.serve(...)
    ├── ApiLive = HttpApiBuilder.layer(Api)
    │   ├── HealthHandler
    │   ├── FilmHandler
    │   ├── InventoryHandler
    │   ├── RentalHandler
    │   ├── PaymentHandler
    │   ├── CustomerAuthHandler
    │   └── StaffAuthHandler
    ├── DocsLive (Swagger UI at /docs)
    ├── CorsLive (HttpRouter.cors, 全局)
    ├── RateLimiterLive (HttpRouter.middleware, 全局, 按 IP)
    ├── ServicesLive
    │   ├── FilmService.layer → FilmRepository.layer
    │   ├── InventoryService.layer → InventoryRepository.layer
    │   ├── RentalService.layer → RentalRepository.layer + InventoryRepository.layer
    │   ├── PaymentService.layer → PaymentRepository.layer
    │   ├── CustomerAuthService.layer
    │   ├── StaffAuthService.layer
    │   └── (全部) → DatabaseLive
    └── ServerLive (BunHttpServer)

DatabaseLive: PgClient 连接池配置
```

### Effect-ts 模式 (Effect 4)

v4 中 `@effect/platform` 和 `@effect/sql` 已并入 `effect`：HTTP 相关从 `effect/http`、`effect/http-api` 导入，SQL 从 `effect/sql` 导入。

**Service 定义**：使用 `Context.Service` + `make`，并手动定义 `layer`（v4 不再自动生成 `.Default`，也没有 `dependencies` 选项）
```typescript
export class FilmService extends Context.Service<FilmService>()("FilmService", {
  make: Effect.gen(function* () {
    const repo = yield* FilmRepository;
    return {
      getFilmById: Effect.fn("FilmService.getFilmById")(function* (filmId: FilmId) {
        yield* Effect.logDebug(`Getting film by ID: ${filmId}`);
        return yield* repo.findById(filmId);
      }),
      // ...
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(FilmRepository.layer)
  );
}
```

**错误类型**：使用 `Schema.TaggedError`，HTTP 状态码写在第三个参数
```typescript
export class FilmNotFoundError extends Schema.TaggedError<FilmNotFoundError>()(
  "FilmNotFoundError",
  { message: Schema.String, filmId: Schema.Number },
  { httpApiStatus: 404 }
) {}
```

**API 定义**：`HttpApiEndpoint` 用选项对象声明 `params` / `query` / `payload` / `success` / `error`
```typescript
export class FilmApi extends HttpApiGroup.make("films").add(
  HttpApiEndpoint.get("getById", "/films/:filmId", {
    // 路径参数用 FiniteFromString：v4 的 NumberFromString 会把 "abc" 解码成 NaN
    params: { filmId: Schema.FiniteFromString },
    success: FilmDetail,
    // 每个端点必须声明 handler 可能返回的所有错误，未声明的错误会变成空 body 的 500
    error: [FilmNotFoundError, DatabaseQueryError],
  }).annotate(OpenApi.Summary, "Get film details"),
  HttpApiEndpoint.get("list", "/films", {
    query: { search: Schema.optional(Schema.String) /* ... */ },
    success: PaginatedFilms,
    error: DatabaseQueryError,
  })
) {}
```

**Schema 注意事项**：
- 日期字段用 `Schema.DateFromString`（v4 的 `Schema.Date` 不再从字符串解码）
- 带默认值的可选字段（v3 的 `optionalWith(X, { default })`）同时设置解码默认值和构造默认值：
  ```typescript
  staffId: StaffId.pipe(
    Schema.withDecodingDefaultType(Effect.succeed(1 as StaffId)),
    Schema.withConstructorDefault(Effect.succeed(1 as StaffId)),
  ),
  ```
- 请求校验失败时返回 400，body 为空

**Handler 实现**：使用 `HttpApiBuilder.group`，请求字段为 `params` / `query` / `payload`
```typescript
export const FilmHandler = HttpApiBuilder.group(Api, "films", (handlers) =>
  handlers
    .handle("getById", ({ params }) =>
      Effect.gen(function* () {
        const filmService = yield* FilmService;
        const film = yield* filmService.getFilmById(params.filmId as FilmId);
        if (!film) {
          return yield* Effect.fail(
            new FilmNotFoundError({ message: "Film not found", filmId: params.filmId })
          );
        }
        return film;
      })
    )
    .handle("list", ({ query }) => /* ... */)
);
```

**认证**：`middleware/auth.ts` 提供普通的 Effect，在 handler 内调用
```typescript
import { requireAuth, requireCustomer, requireStaff } from "../middleware/auth.js";

.handle("create", ({ payload }) =>
  Effect.gen(function* () {
    yield* requireStaff;              // 需要员工 token
    // const user = yield* requireAuth; // 任意已登录用户
    // ...
  })
)
```

### 测试模式

使用 `bun:test` + `Layer.succeed` 模拟依赖：
```typescript
import { describe, it, expect } from "bun:test";
import { Effect, Layer } from "effect";
import { PaymentService } from "../../src/service/PaymentService.js";
import { PaymentRepository } from "../../src/repository/PaymentRepository.js";

const MockPaymentRepo = Layer.succeed(PaymentRepository, {
  createPayment: () => Effect.succeed(mockPaymentCreated),
  getCustomerBalance: () => Effect.succeed(mockCustomerBalance),
  getCustomerPayments: () => Effect.succeed([]),
  findById: () => Effect.succeed(undefined),
});

// PaymentService.layer 已经提供了真实的 PaymentRepository.layer，
// 所以测试中用 PaymentService.make 和 mock 仓储重新组装
const TestPaymentService = Layer.effect(PaymentService, PaymentService.make).pipe(
  Layer.provide(MockPaymentRepo)
);

const result = await Effect.runPromise(
  Effect.gen(function* () {
    const service = yield* PaymentService;
    return yield* service.getCustomerBalance(1 as CustomerId);
  }).pipe(Effect.provide(TestPaymentService))
);
```

集成测试使用真实数据库：`Effect.provide(FilmRepository.layer)` + `Effect.provide(TestDatabaseLayer)`。

### 数据库迁移

SQL 迁移文件放在根目录 `migrations/` 目录，按文件名排序执行。运行 `bun migrate` 应用迁移。

Effect 4 的 Postgres 驱动只支持扩展查询协议，一次只能执行一条语句，因此 `migrate.ts` 会先用 `splitSqlStatements` 把文件拆成单条语句（能识别引号、`$$` 函数体和注释），再在同一个事务里逐条执行。

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
- `DB_NAME`: 数据库名称 (默认: effect_dvd_rental)
- `DB_USER`: 数据库用户名
- `DB_PASSWORD`: 数据库密码
- `DB_POOL_MIN`: 连接池最小连接数 (默认: 1)
- `DB_POOL_MAX`: 连接池最大连接数 (默认: 10)

### JWT Authentication
- `JWT_SECRET`: JWT 签名密钥 (**生产环境必须修改！**)
- `JWT_EXPIRES_IN`: Token 过期时间 (如: 1h, 30m, 7d)

### Logging
- `LOG_LEVEL`: 日志级别
  - 可选值: `trace` | `debug` | `info` | `warning` (或 `warn`) | `error` | `fatal` | `none`
  - 默认: `info`

### OpenTelemetry
- `OTEL_EXPORTER_OTLP_ENDPOINT`: OpenTelemetry 导出端点 (默认: http://localhost:4318)

## API 端点

参见 `main.ts` 中 `printStartupInfo` 的端点列表或访问 http://localhost:8080/docs 查看 Swagger 文档。

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

2. **数据库查询**使用 `effect/sql` 的 `SqlClient`：
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
