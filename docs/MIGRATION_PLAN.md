# 迁移计划：Effect 3 → 4，TypeScript 5.9 → 7

> 制定日期：2026-10-05
> 状态：计划阶段，尚未开始实施。
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

- [ ] **跑通本地环境。** `docker-compose.yml` 的库名是 `effect-dvd-rental`，而 `.env.example` 与代码默认的 `DB_NAME` 是 `effect_crud`；仓库中也没有 `.env`。直接用默认值很可能连不上库，需先配置 `.env`。
- [ ] **记录基线结果。** 依次执行 `bun check`、`bun test`、`bun run docker:build`，记录通过情况与已有失败。
- [ ] **保存 API 黄金快照。**
  - `tests/api/` 是对 `localhost:8080` 的黑盒测试，只覆盖 films、inventory、payments。
  - rentals、customer 登录/注册/profile、staff 登录/列表/profile、`/health`、`/ready` 都没有测试。
  - 迁移前用脚本请求这些端点（含典型的错误情况：不存在的 id、非法参数、缺失/错误的 token），连同 OpenAPI JSON 一起保存；每个阶段结束后重放并对比。

## 4. 阶段 1：TypeScript 5.9 → 7.0

当前 `tsconfig.json` 已经是 `strict`、`moduleResolution: "bundler"`、`module/target: "ESNext"`、`types` 显式指定，没有 `baseUrl`、`target: es5`、`moduleResolution: node` 等 TS 7 移除的选项。对照官方移除清单，应该基本可以直接升级（**未实际验证**）。

步骤：

- [ ] 先安装 `typescript@6`，执行 `bun check`，处理所有弃用警告（官方推荐的过渡步骤）。
- [ ] 升级到 `typescript@7`，再次 `bun check`。
- [ ] 把 `tsconfig.json` 中的 `"types": ["bun-types"]` 改为 `["bun"]`（`@types/bun` 的正式写法，其 dist-tag 含 `ts7.0`）。

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

- [ ] 按第 1 节调整 `package.json`，执行 `bun install`。
- [ ] 全局替换导入：`@effect/platform` 与 `@effect/sql` 的导入分别改到 `effect/http`、`effect/http-api`、`effect/sql` 等子路径（完整对照见 `effect/migration/v3-to-v4.md` 的 Import Map）。
- [ ] v4 中不存在 `effect/unstable/*` 路径，不要使用旧写法。

#### 2.2 Schema

- [ ] `Schema.Date` → `Schema.DateFromString`（18 处）。v4 的 `Schema.Date` 是"自身类型"，不再做字符串转换。
- [ ] `Schema.annotations` → `Schema.annotate`（14 处）。
- [ ] `Schema.int()` → `Schema.isInt`；`Schema.positive()` → `Schema.isGreaterThan(0)`；`Schema.lessThanOrEqualTo` → `Schema.isLessThanOrEqualTo`，均通过 `Schema.check` 应用。
- [ ] `Schema.optionalWith(X, { default })`（5 处）→ `X.pipe(Schema.withDecodingDefaultType(Effect.succeed(...)))`。
- [ ] `Schema.NumberFromString`（19 处）：v4 中 `"abc"` 解码为 `NaN`、`""` 解码为 `0`，不再报错。应改用 `Schema.FiniteFromString` 并补充范围检查，避免 `/films/abc` 之类的请求响应码改变。
- [ ] `Schema.TaggedError` 的 HTTP 状态码：从 `HttpApiSchema.annotations({ status: 404 })` 改为第三个参数 `{ httpApiStatus: 404 }`。
- [ ] 其余 `Schema.Class`、`Struct`、`NullOr`、`Array`、`Boolean`、`brand` 等名称保留，以类型检查结果为准。

#### 2.3 服务与仓储

- [ ] `Effect.Service` → `Context.Service` + `make`，不再自动生成 `.Default`，也没有 `dependencies` 选项：

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

- [ ] 命名约定：`.Default` → `.layer`。
- [ ] `Context.Tag("CurrentUser")<CurrentUser, AuthUser>()` → `Context.Service<CurrentUser, AuthUser>()("CurrentUser")`（注意类型参数与标识符的顺序对调）。
- [ ] `config/Services.ts` 目前对同一个 repository layer 重复 provide 多次；v4 的 `Effect.provide` 之间会共享 layer 记忆化，重复构建不再发生，可顺手理顺依赖图。

#### 2.4 配置与运行时

- [ ] Config：`Config.string` → `Config.String`、`Config.number` → `Config.Number`、`Config.integer` → `Config.Int`、`Config.redacted` → `Config.Redacted`；`Config.all`、`Config.withDefault` 不变。
- [ ] `PgClient.layerConfig(DatabaseConfig)`：字段名 `host/port/database/username/password/minConnections/maxConnections` 在 v4 的 `PgPoolConfig` 中仍存在，以类型检查为准。
- [ ] 日志：
  - `Logger.replace(Logger.defaultLogger, X)` → `Logger.layer([Logger.consolePretty({ formatDate }), Logger.tracerLogger])`（`prettyLogger` 已改名 `consolePretty`）。
  - `Logger.minimumLogLevel(level)` → `Layer.succeed(References.MinimumLogLevel, level)`。
  - `LogLevel.Warning` 变为字符串 `"Warn"`；环境变量 `LOG_LEVEL=warning` 需要继续兼容，保留一层映射。
- [ ] `Layer.unwrapEffect` → `Layer.unwrap`（`Server.ts`、`Logger.ts`、`Telemetry.ts`）。
- [ ] `NodeSdk.layer(...)`：保留，配置结构不变。
- [ ] `BunContext` → `BunServices`；`BunHttpServer.layer({ port })` 保留。

#### 2.5 HttpApi（最大的一块）

涉及 7 个 `api/*` 与 7 个 `handler/*`。

- [ ] 端点定义由链式改为构造参数：

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
- [ ] `HttpApiGroup.add` 变为可变参数，可一次添加多个端点。
- [ ] `HttpApiBuilder.group(Api, "films", build)`：`build` 中用 `handlers.handle(...)` 或 `handlers.handleAll({...})`；handler 的请求字段名由 `path/urlParams` 改为 `params/query`。
- [ ] `HttpApiBuilder.api(Api)` → `HttpApiBuilder.layer(Api, { openapiPath })`。
- [ ] `HttpApiSwagger.layer({ path: "/docs" })` → `HttpApiSwagger.layer(Api, { path: "/docs" })`。
- [ ] `HttpApi.make(...).annotate(OpenApi.Title, ...)`：`OpenApi.*` 注解的写法需对照 `effect/http-api/OpenApi` 调整。
- [ ] API 级和组级的错误通道被移除，每个端点必须自己声明会返回的错误。

#### 2.6 中间件

- [ ] CORS：`HttpApiBuilder.middleware(HttpMiddleware.cors(...))` → `HttpRouter.cors(...)` 层（`HttpMiddleware.cors` 选项不变）。
- [ ] 限流器：`HttpApiBuilder.Middleware` 已被移除，改写为 `HttpRouter.middleware` 层；客户端 IP 可用 `request.remoteAddress`（`Option<string>`），原来的 `@ts-expect-error` 可以去掉。
- [ ] `Effect.forkDaemon` → `Effect.forkDetach`（或在 layer 内改用 `Effect.forkScoped` 以便随 layer 关闭）。
- [ ] 鉴权：现有 handler 内的 `yield* requireStaff` / `requireCustomer` / `requireAuth` 都是普通 Effect，迁移时原样保留。

#### 2.7 测试

- [ ] `XxxRepository.Default` → `XxxRepository.layer`。
- [ ] `Layer.succeed(Tag, impl)` 双参数写法仍受支持。
- [ ] 清理 mock 中不再需要的 `_tag` 字段，以类型检查为准。

#### 2.8 入口与脚本

- [ ] `main.ts`：`HttpApiBuilder.serve()` 改为 `HttpRouter.serve(routes)`，再 `Layer.provide(BunHttpServer.layer({ port }))`；`BunRuntime.runMain(app, { disablePrettyLogger: true })` 的选项在 v4 中仍存在。
- [ ] `scripts/migrate.ts`：`SqlClient` 改从 `effect/sql` 导入，`FileSystem` / `Path` 从 `effect` 导入，`BunContext.layer` 改 `BunServices.layer`。

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

- [ ] **更新 `CLAUDE.md`。** 其中 `Effect.Service`、`HttpApi`、测试示例全部是 v3 写法，迁移后会过时。
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
