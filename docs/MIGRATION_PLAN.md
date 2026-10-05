# 迁移计划：Effect 3 → 4，TypeScript 5.9 → 7

> 制定日期：2026-10-05
> 状态：已完成（2026-10-05，分支 `migrate/effect-v4-ts7`）。实施结果、与计划的出入和遗留问题见第 10 节。
>
> 本计划基于对本地 `effect/` 仓库（4.0.1）中迁移文档与源码的阅读、npm 与 TypeScript 官方公告的查证，以及对本项目当前用法的盘点。除特别标注"未验证"的内容外，API 改名均来自 `effect/migration/` 下的官方迁移文档。

## 1. 目标版本

| 项 | 当前 | 目标 | 依据 |
|---|---|---|---|
| `effect` | 3.19.14 | **4.0.1**（npm `latest`） | npm dist-tags；与本地 `effect/` 仓库版本一致 |
| `typescript` | 5.9.3 | **7.0.2**（npm `latest`） | [官方公告](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)，2026-07-08 GA |

### 依赖变化

| 包 | 处理 |
|---|---|
| `effect` | 3.19.14 → 4.0.1 |
| `@effect/platform-bun` | 0.87.0 → 4.0.1 |
| `@effect/sql-pg` | 0.50.1 → 4.0.1 |
| `@effect/opentelemetry` | 0.60.0 → 4.0.1 |
| `@effect/platform` | **删除**，已并入 `effect` |
| `@effect/sql` | **删除**，已并入 `effect` |
| `@effect/schema` | **删除**，代码中没有任何 import |
| `postgres` | 代码中没有 import，确认无其他引用后删除 |
| `@opentelemetry/*` | 补齐 `@effect/opentelemetry@4` 的对等依赖：`api`（>=1.9）、`api-logs`、`sdk-trace-base`、`sdk-metrics`、`sdk-logs`；现有的 `resources`、`sdk-trace-node`、`sdk-trace-web`、`semantic-conventions` 版本范围需核对 |

v4 的所有 Effect 生态包共用同一个版本号，必须同步升级。

## 2. 总体策略

- **先升 TypeScript，再升 Effect。** TS 7 的改动小且与 Effect 版本无关，先做完它，后续出现的类型错误才能确定来自 Effect。
- **每个阶段单独一个分支、单独合并。** 出问题可单独回退。
- **迁移与重构分开。** 迁移 PR 只做行为保持的改写；鉴权中间件化、换用内置 OTLP 等放到迁移稳定之后。

## 3. 阶段 0：建立基线（迁移前必做）

- [x] **跑通本地环境。** `docker-compose.yml` 的库名是 `effect-dvd-rental`，而 `.env.example` 与代码默认的 `DB_NAME` 是 `effect_crud`；仓库中也没有 `.env`。直接用默认值很可能连不上库，需先配置 `.env`。
- [x] **记录基线结果。** 依次执行 `bun check`、`bun test`、`bun run docker:build`，记录通过情况与已有失败。
- [x] **保存 API 黄金快照。**
  - `tests/api/` 是对 `localhost:8080` 的黑盒测试，只覆盖 films、inventory、payments。
  - rentals、customer 登录/注册/profile、staff 登录/列表/profile、`/health`、`/ready` 都没有测试。
  - 迁移前用脚本请求这些端点（含典型的错误情况：不存在的 id、非法参数、缺失/错误的 token），连同 OpenAPI JSON 一起保存；每个阶段结束后重放并对比。

## 4. 阶段 1：TypeScript 5.9 → 7.0

当前 `tsconfig.json` 已经是 `strict`、`moduleResolution: "bundler"`、`module/target: "ESNext"`、`types` 显式指定，没有 `baseUrl`、`target: es5`、`moduleResolution: node` 等 TS 7 移除的选项。对照官方移除清单，应该基本可以直接升级（**未实际验证**）。

步骤：

- [x] 先安装 `typescript@6`，执行 `bun check`，处理所有弃用警告（官方推荐的过渡步骤）。
- [x] 升级到 `typescript@7`，再次 `bun check`。
- [x] 把 `tsconfig.json` 中的 `"types": ["bun-types"]` 改为 `["bun"]`（`@types/bun` 的正式写法，其 dist-tag 含 `ts7.0`）。

TS 7 的注意事项：

- **TS 7 不带编程 API**，官方称 7.1 才会提供新的 API。依赖 `typescript` 包做编程调用的工具暂时无法用 7。本项目目前只使用 `tsc` 命令行，不受影响。
- 编辑器：官方提到 VS Code 有专用扩展、Visual Studio 会自动启用。项目有 `.idea` 目录，JetBrains 对 TS 7 的支持**未验证**。类型检查结果以 `bun check` 为准。
- Effect README 推荐在 TS 7 下使用 `@effect/tsgo` 获得 Effect 专用诊断，可作为后续可选项。

验收：`bun check` 零错误；`bun test` 与基线一致。

## 5. 阶段 2：Effect 3 → 4

### 5.1 影响面盘点

| 类别 | 用量 | 涉及 |
|---|---|---|
| `Effect.Service` | 11 处 | 6 个 service、4 个 repository、`AppConfig.ts` 的 `JwtSecretService` |
| `Context.Tag` | 1 处 | `middleware/auth.ts` 的 `CurrentUser` |
| `Schema.Class` | 35 处 | 11 个文件 |
| `Schema.TaggedError` | 14 处 | 6 个文件（签名不变） |
| `Data.TaggedError` | 14 处 | 4 个文件（v4 仍导出，预计无需改动） |
| `Schema.Date` | 18 处 | schema 目录 |
| `Schema.NumberFromString` | 19 处 | 路径与查询参数 |
| `Schema.optionalWith` | 5 处 | 带 `default` |
| `Config.*` | 35 行 | 11 个文件 |
| `HttpApiBuilder.*` | 12 行 | 11 个文件 |
| `HttpApiEndpoint` / `HttpApiGroup` / `OpenApi` 等 | 约 57 行 | 7 个 api 文件及相关 |
| `Logger` / `LogLevel` | 13 行 | `config/Logger.ts` 等 |
| `Layer.*` | 43 行 | 9 个文件 |
| 测试中的 `.Default` / `Layer.succeed` | — | `tests/repository`、`tests/service` |

### 5.2 迁移步骤（按顺序）

#### 2.1 依赖与导入路径

- [x] 按第 1 节调整 `package.json`，执行 `bun install`。
- [x] 全局替换导入：`@effect/platform` 与 `@effect/sql` 的导入分别改到 `effect/http`、`effect/http-api`、`effect/sql` 等子路径（完整对照见 `effect/migration/v3-to-v4.md` 的 Import Map）。
- [x] v4 中不存在 `effect/unstable/*` 路径，不要使用旧写法。

#### 2.2 Schema

- [x] `Schema.Date` → `Schema.DateFromString`（18 处）。v4 的 `Schema.Date` 是"自身类型"，不再做字符串转换。
- [x] `Schema.annotations` → `Schema.annotate`（14 处）。（实际这 14 处都是 `HttpApiSchema.annotations({ status })`，已按下文改为 `{ httpApiStatus }`。）
- [x] `Schema.int()` → `Schema.isInt`；`Schema.positive()` → `Schema.isGreaterThan(0)`；`Schema.lessThanOrEqualTo` → `Schema.isLessThanOrEqualTo`，均通过 `Schema.check` 应用。
- [x] `Schema.optionalWith(X, { default })`（5 处）→ `X.pipe(Schema.withDecodingDefaultType(Effect.succeed(...)))`。**实施补充：** 代码中还有 `new CreatePaymentInput({...})` 等省略该字段的构造调用，需再加 `Schema.withConstructorDefault(Effect.succeed(...))` 才能保持 v3 行为。
- [x] `Schema.NumberFromString`（19 处）：v4 中 `"abc"` 解码为 `NaN`、`""` 解码为 `0`，不再报错。应改用 `Schema.FiniteFromString` 并补充范围检查，避免 `/films/abc` 之类的请求响应码改变。
- [x] `Schema.TaggedError` 的 HTTP 状态码：从 `HttpApiSchema.annotations({ status: 404 })` 改为第三个参数 `{ httpApiStatus: 404 }`。
- [x] 其余 `Schema.Class`、`Struct`、`NullOr`、`Array`、`Boolean`、`brand` 等名称保留，以类型检查结果为准。

#### 2.3 服务与仓储

- [x] `Effect.Service` → `Context.Service` + `make`，不再自动生成 `.Default`，也没有 `dependencies` 选项：

  ```ts
  // v3
  class FilmService extends Effect.Service<FilmService>()("FilmService", {
    effect: Effect.gen(function* () { /* ... */ }),
    dependencies: [FilmRepository.Default],
  }) {}

  // v4
  class FilmService extends Context.Service<FilmService>()("FilmService", {
    make: Effect.gen(function* () { /* ... */ }),
  }) {
    static readonly layer = Layer.effect(this, this.make).pipe(
      Layer.provide(FilmRepository.layer),
    )
  }
  ```

- [x] 命名约定：`.Default` → `.layer`。
- [x] `Context.Tag("CurrentUser")<CurrentUser, AuthUser>()` → `Context.Service<CurrentUser, AuthUser>()("CurrentUser")`（注意类型参数与标识符的顺序对调）。
- [x] `config/Services.ts` 目前对同一个 repository layer 重复 provide 多次；v4 的 `Effect.provide` 之间会共享 layer 记忆化，重复构建不再发生，可顺手理顺依赖图。

#### 2.4 配置与运行时

- [x] Config：`Config.string` → `Config.String`、`Config.number` → `Config.Number`、`Config.integer` → `Config.Int`、`Config.redacted` → `Config.Redacted`；`Config.all`、`Config.withDefault` 不变。
- [x] `PgClient.layerConfig(DatabaseConfig)`：字段名 `host/port/database/username/password/minConnections/maxConnections` 在 v4 的 `PgPoolConfig` 中仍存在，以类型检查为准。
- [x] 日志：
  - `Logger.replace(Logger.defaultLogger, X)` → `Logger.layer([Logger.consolePretty({ formatDate }), Logger.tracerLogger])`（`prettyLogger` 已改名 `consolePretty`）。
  - `Logger.minimumLogLevel(level)` → `Layer.succeed(References.MinimumLogLevel, level)`。
  - `LogLevel.Warning` 变为字符串 `"Warn"`；环境变量 `LOG_LEVEL=warning` 需要继续兼容，保留一层映射。
- [x] `Layer.unwrapEffect` → `Layer.unwrap`（`Server.ts`、`Logger.ts`、`Telemetry.ts`）。
- [x] `NodeSdk.layer(...)`：保留，配置结构不变。
- [x] `BunContext` → `BunServices`；`BunHttpServer.layer({ port })` 保留。

#### 2.5 HttpApi（最大的一块）

涉及 7 个 `api/*` 与 7 个 `handler/*`。

- [x] 端点定义由链式改为构造参数：

  ```ts
  // v3
  HttpApiEndpoint.get("getFilmById", "/films/:id")
    .setPath(Schema.Struct({ id: Schema.NumberFromString }))
    .addSuccess(Film)
    .addError(FilmNotFoundError)

  // v4
  HttpApiEndpoint.get("getFilmById", "/films/:id", {
    params: { id: Schema.FiniteFromString },
    success: Film,
    error: FilmNotFoundError,
  })
  ```

  `setPath` → `params`，`setUrlParams` → `query`，`setPayload` → `payload`，`addSuccess` → `success`，`addError` → `error`。
- [x] `HttpApiGroup.add` 变为可变参数，可一次添加多个端点。
- [x] `HttpApiBuilder.group(Api, "films", build)`：`build` 中用 `handlers.handle(...)` 或 `handlers.handleAll({...})`；handler 的请求字段名由 `path/urlParams` 改为 `params/query`。
- [x] `HttpApiBuilder.api(Api)` → `HttpApiBuilder.layer(Api, { openapiPath })`。（实施时未设置 `openapiPath`，与 v3 一样不额外暴露 `openapi.json`。）
- [x] `HttpApiSwagger.layer({ path: "/docs" })` → `HttpApiSwagger.layer(Api, { path: "/docs" })`。
- [x] `HttpApi.make(...).annotate(OpenApi.Title, ...)`：`OpenApi.*` 注解的写法需对照 `effect/http-api/OpenApi` 调整。
- [x] API 级和组级的错误通道被移除，每个端点必须自己声明会返回的错误。

#### 2.6 中间件

- [x] CORS：`HttpApiBuilder.middleware(HttpMiddleware.cors(...))` → `HttpRouter.cors(...)` 层（`HttpMiddleware.cors` 选项不变）。
- [x] 限流器：`HttpApiBuilder.Middleware` 已被移除，改写为 `HttpRouter.middleware` 层；客户端 IP 可用 `request.remoteAddress`（`Option<string>`），原来的 `@ts-expect-error` 可以去掉。
- [x] `Effect.forkDaemon` → `Effect.forkDetach`（或在 layer 内改用 `Effect.forkScoped` 以便随 layer 关闭）。
- [x] 鉴权：现有 handler 内的 `yield* requireStaff` / `requireCustomer` / `requireAuth` 都是普通 Effect，迁移时原样保留。

#### 2.7 测试

- [x] `XxxRepository.Default` → `XxxRepository.layer`。
- [x] `Layer.succeed(Tag, impl)` 双参数写法仍受支持。
- [x] 清理 mock 中不再需要的 `_tag` 字段，以类型检查为准。

#### 2.8 入口与脚本

- [x] `main.ts`：`HttpApiBuilder.serve()` 改为 `HttpRouter.serve(routes)`，再 `Layer.provide(BunHttpServer.layer({ port }))`；~~`BunRuntime.runMain(app, { disablePrettyLogger: true })` 的选项在 v4 中仍存在。~~ **更正：** v4 的 `runMain` 只接受 `disableErrorReporting` 和 `teardown`，见第 10.3 节。
- [x] `scripts/migrate.ts`：`SqlClient` 改从 `effect/sql` 导入，`FileSystem` / `Path` 从 `effect` 导入，`BunContext.layer` 改 `BunServices.layer`。

## 6. 风险点

以下是文档中明确写出的行为变化，最容易悄悄改变线上表现：

1. **`NumberFromString` 语义变化**（见 2.2）。涉及路径参数 `:id` 与分页参数，必须配合黄金快照验证。
2. **请求校验失败的响应码可能由 400 变为 500。** 文档说明 v4 的 `HttpApiSchemaError` 默认是 defect，除非用 schema-error 中间件转换。需用非法输入实际验证，必要时补充中间件映射回 400。**此项未验证。**
3. **handler 错误类型检查更严格**（见 2.5）。
4. **`Option`、`Ref`、`Deferred`、`Fiber` 不再是 `Effect` 子类型。** 项目中的 `Ref.make` / `Ref.modify` 是正常用法，不受影响，但编译后留意是否有隐式 yield。
5. **本地 `effect/` 仓库可能比 npm 上的 4.0.1 新。** 实际 API 以安装后的类型声明为准。
6. **对等依赖：** `@effect/opentelemetry@4` 要求的 OTel 包较多（见第 1 节），`bun install` 时留意缺失警告。

## 7. 每个阶段的验证关卡

每步都需通过以下检查才算完成：

- `bun check` 零错误
- `bun test` 全部通过（单元测试需要 Postgres，先 `bun db:up` 并 `bun migrate`）
- 启动服务后运行 `tests/api`
- 重放阶段 0 的黄金快照并对比，包括 OpenAPI JSON
- 阶段 2 结束时再执行一次 `bun run docker:build`，并确认容器的 `/health` 健康检查通过

## 8. 收尾与可选项

必须做：

- [x] **更新 `CLAUDE.md`。** 其中 `Effect.Service`、`HttpApi`、测试示例全部是 v3 写法，迁移后会过时。
  - 另有一处与现状不符：文档提到 `customerAuth` / `staffAuth`，但代码中实际导出的是 `requireCustomer`、`requireStaff`、`requireAuth`、`withAuth`。
  - 同时核对 `DB_NAME` 默认值与 `docker-compose.yml` 的差异。

可选（迁移稳定后再做，不要混进迁移 PR）：

- [ ] 把 handler 内联鉴权改为 `HttpApiMiddleware.Service` + `HttpApiSecurity.bearer`，OpenAPI 中会自动生成安全方案。
- [ ] 用 v4 内置的 `effect/observability/Otlp` 代替当前的多个 OpenTelemetry 依赖。
- [ ] 增加 `@effect/tsgo` 获得 Effect 专用诊断。

## 9. 参考资料

本地 `effect/` 仓库（版本 4.0.1，位于本项目的上一级目录）：

- `effect/MIGRATION.md`：总览
- `effect/migration/v3-to-v4.md`：完整的导入对照与 API 改名表（体积很大，建议按名称搜索）
- `effect/migration/services.md`、`error-handling.md`、`forking.md`、`yieldable.md`、`layer-memoization.md`、`runtime.md`、`cause.md`、`fiber-keep-alive.md`
- `effect/migration/schema.md`：Schema 迁移详解
- `effect/ai-docs/src/51_http-server/`：v4 HttpApi 的完整示例（端点、鉴权中间件、handler、服务启动）

外部：

- [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- [Announcing TypeScript 6.0](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/)

## 10. 实施结果（2026-10-05）

### 10.1 提交

| 提交 | 内容 |
|---|---|
| `chore: use effect_dvd_rental as the database name everywhere` | 阶段 0：库名统一为 `effect_dvd_rental`（`docker-compose.yml`、`.env.example`、`Database.ts` 默认值），并把残留的 `effect-crud-app` 改为 `effect-dvd-rental` |
| `test: add API snapshot script and Effect 3 baseline` | 阶段 0：`tests/snapshot/api-snapshot.ts`（88 个请求 + OpenAPI） |
| `build: upgrade TypeScript 5.9 to 7.0` | 阶段 1 |
| `fix(docker): drop --production=false from bun install` | 迁移前就存在的构建失败，见 10.3 |
| `feat: migrate from Effect 3.19 to Effect 4.0` | 阶段 2 |
| `docs: ...` | 本节、`CLAUDE.md`、`README.md`，快照基线更新为 Effect 4 的输出 |

按用户要求，所有阶段在同一个分支上按提交拆分，而不是第 2 节建议的每阶段一个分支。

### 10.2 验证结果

| 关卡 | 基线（Effect 3 / TS 5.9） | 结果（Effect 4 / TS 7） |
|---|---|---|
| `bun check` | 通过 | 通过（约 0.3 秒） |
| `bun test` | 32 通过 | 37 通过（新增 5 个 `splitSqlStatements` 测试） |
| API 快照 | 88 个响应 | 77 个完全一致，其余见 10.4 |
| OpenAPI | 27 个操作 | 27 个操作，operationId、summary、参数、请求体一致；仅缺少 v3 自动附加的 400 响应 |
| `docker:build` + 容器 `/health` | 构建失败（见 10.3） | 构建成功，容器 healthy |
| 迁移脚本 | 通过 | 通过；`pg_dump` 与用 `psql` 直接导入同一批文件的结果一致（迁移时生成的时间戳除外） |

另外手动确认：限流按 IP 生效（429 + `Retry-After`），`LOG_LEVEL=warning` 仍可用，Jaeger 中 `http.server → Service → sql.execute` 的 span 嵌套正确，Ctrl+C 可正常退出。

### 10.3 计划之外的问题

1. **迁移脚本无法执行多语句 SQL。** v4 的 `@effect/sql-pg` 只用扩展查询协议，一次只能执行一条语句（报错 `cannot insert multiple commands into a prepared statement`）。新增 `src/scripts/splitSqlStatements.ts`，按引号、`$$` 函数体和注释拆分后在同一事务中逐条执行（`.unprepared`，避免填满预编译缓存）。迁移耗时从约 1.2 秒变为约 5 秒。
2. **`runMain` 不再有 `disablePrettyLogger`。** v4 的 `Logger.layer` 只作用于被提供的 layer，而不像 v3 那样修改整个 fiber。因此 `LoggerLive`、`TracingLive` 改为在 `main.ts` 最外层提供，启动日志和请求日志都使用自定义格式。
3. **`HttpRouter.serve` 默认输出每个请求的访问日志和 "Listening on" 行。** 为保持 v3 的输出，两者都已关闭（`disableLogger`、`disableListenLog`）。
4. **未声明的错误变成空 body 的 500。** `GET /payments/:paymentId` 的 handler 在缺少 token 时返回 `PaymentError`，但端点只声明了 `PaymentNotFoundError`；v3 仍会编码，v4 则变成空的 500。已在端点上补充声明。类型检查没有发现这一问题，因为 handler 中的 `Effect.mapError((err: any) => ...)` 把错误类型变成了 `any`（见 10.5）。
5. **v3 的限流实际上是全局的。** v3 读取 `request.source.remoteAddress`，Bun 的 `Request` 没有该属性，所有客户端共用 `"unknown"` 这一个计数。改用 `request.remoteAddress` 后才真正按 IP 限流，与 README 描述一致。
6. **Docker 构建在迁移前就会失败。** `oven/bun:1.3` 的 `bun install` 不接受 `--production=false`。已删除该参数（默认即安装 devDependencies）。
7. **风险点 2 的结论：** 请求校验失败仍返回 400，没有变成 500，但 body 为空（见 10.4）。
8. 去掉了从未被 import 的 `@opentelemetry/sdk-node`，改为显式声明 `@effect/opentelemetry@4` 实际加载的 OTel 包。

### 10.4 与基线不同的响应（11 个）

| 请求 | Effect 3 | Effect 4 | 说明 |
|---|---|---|---|
| 8 个校验失败（`/films/abc`、`/films/abc/actors`、`/stores/abc`、`/films/abc/availability`、`/stores/1/films/abc/availability`、`/rentals/abc`、登录缺字段、创建租赁缺字段） | 400，body 为 `HttpApiDecodeError` 详情 | 400，空 body | 状态码不变。如需恢复错误详情，可用 `HttpApiMiddleware.layerSchemaErrorTransform` 映射为自定义 400 错误，但这会给所有端点的 API 契约增加一个错误类型，未在迁移中处理 |
| `GET /films/1.5` | 500 `DatabaseQueryError` | 404 `FilmNotFoundError` | 新驱动对 `film_id = 1.5` 的比较不再报错，查不到记录 |
| `GET /films?limit=0` | `totalPages: null` | `totalPages: "Infinity"` | 原有的除零问题；v4 的 JSON 编码把 `Infinity` 写成字符串 |
| `POST /payments`（合法输入） | 500，`Failed to execute statement` | 500，`PgConnection: Query failed` | 原有问题（见 10.5），仅驱动错误信息不同 |

基线文件 `tests/snapshot/baseline/` 已更新为 Effect 4 的输出；Effect 3 的版本可在提交 `test: add API snapshot script and Effect 3 baseline` 中找到。

### 10.5 遗留问题（迁移前就存在，未在本次修复）

- **合法的支付请求一定失败。** `payment` 表按月分区，但只有 2022-01 至 2022-07 的分区，当前时间写入报 `no partition of relation "payment" found for row`。
- **鉴权失败的状态码不一致。** 例如无 token 访问 `GET /rentals/:id` 返回 404，访问 `/customers/:id/rentals`、`POST /rentals`、`POST /payments` 返回 500，而不是 401/403。可结合第 8 节的 `HttpApiMiddleware` + `HttpApiSecurity.bearer` 一并处理。
- **`GET /films?page=abc` 返回 500。** 列表的查询参数都是字符串，handler 中 `Number("abc")` 得到 `NaN` 后才出错，应在 schema 层校验。
- **handler 中的 `(err: any)` 让错误类型检查失效。** 10.3 第 4 点的问题就是因此没被编译器发现，建议改为 `Effect.catchTags` 等有类型的写法。
- **`migrations/006_staff_auth.sql` 的注释写着默认密码是 `admin123`，** 实际哈希对应 `changeme`（与 `005` 相同）。
- `src/schema/Common.ts` 中的 `PaginationQuery`、`PaginatedResponse` 以及 `config/AppConfig.ts` 中的 `JwtSecretService` 没有被使用。迁移时仍按 v4 改写，未删除。

