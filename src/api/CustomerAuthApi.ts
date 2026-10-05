import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api";
import { Effect, Schema } from "effect";

// ============================================================
// Customer Auth Schemas
// ============================================================

export class CustomerLoginInput extends Schema.Class<CustomerLoginInput>("CustomerLoginInput")({
  email: Schema.String,
  password: Schema.String,
}) {}

export class CustomerRegisterInput extends Schema.Class<CustomerRegisterInput>("CustomerRegisterInput")({
  email: Schema.String,
  password: Schema.String,
  firstName: Schema.String,
  lastName: Schema.String,
  storeId: Schema.Number.pipe(
    Schema.withDecodingDefaultType(Effect.succeed(1)),
    Schema.withConstructorDefault(Effect.succeed(1)),
  ),
}) {}

export class CustomerAuthResponse extends Schema.Class<CustomerAuthResponse>("CustomerAuthResponse")({
  customerId: Schema.Number,
  email: Schema.String,
  firstName: Schema.String,
  lastName: Schema.String,
  token: Schema.String,
}) {}

export class CustomerProfileResponse extends Schema.Class<CustomerProfileResponse>("CustomerProfileResponse")({
  customerId: Schema.Number,
  email: Schema.String,
  firstName: Schema.String,
  lastName: Schema.String,
  storeId: Schema.Number,
  isActive: Schema.Boolean,
}) {}

export class UpdatePasswordInput extends Schema.Class<UpdatePasswordInput>("UpdatePasswordInput")({
  currentPassword: Schema.String,
  newPassword: Schema.String,
}) {}

// ============================================================
// Customer Auth API Error Schemas
// ============================================================

export class CustomerAuthError extends Schema.TaggedError<CustomerAuthError>()(
  "CustomerAuthError",
  { message: Schema.String },
  { httpApiStatus: 401 }
) {}

export class CustomerEmailExistsError extends Schema.TaggedError<CustomerEmailExistsError>()(
  "CustomerEmailExistsError",
  { message: Schema.String, email: Schema.String },
  { httpApiStatus: 409 }
) {}

// ============================================================
// Customer Auth API Definition
// ============================================================

export class CustomerAuthApi extends HttpApiGroup.make("customer-auth").add(
  HttpApiEndpoint.post("login", "/customer/login", {
    payload: CustomerLoginInput,
    success: CustomerAuthResponse,
    error: CustomerAuthError,
  })
    .annotate(OpenApi.Summary, "Customer login")
    .annotate(OpenApi.Description, "Authenticate a customer and receive a JWT token."),
  HttpApiEndpoint.post("register", "/customer/register", {
    payload: CustomerRegisterInput,
    success: CustomerAuthResponse,
    error: [CustomerEmailExistsError, CustomerAuthError],
  })
    .annotate(OpenApi.Summary, "Customer registration")
    .annotate(OpenApi.Description, "Register a new customer account."),
  HttpApiEndpoint.get("profile", "/customer/profile/:customerId", {
    params: { customerId: Schema.FiniteFromString },
    success: CustomerProfileResponse,
    error: CustomerAuthError,
  })
    .annotate(OpenApi.Summary, "Get customer profile")
    .annotate(OpenApi.Description, "Get customer profile information."),
  HttpApiEndpoint.put("updatePassword", "/customer/password/:customerId", {
    params: { customerId: Schema.FiniteFromString },
    payload: UpdatePasswordInput,
    success: Schema.Struct({ success: Schema.Boolean }),
    error: CustomerAuthError,
  })
    .annotate(OpenApi.Summary, "Update password")
    .annotate(OpenApi.Description, "Update customer password.")
) {}
