import { HttpApiBuilder } from "effect/http-api";
import { Effect } from "effect";
import { Api, StaffAuthError } from "../api/index.js";
import { StaffAuthService } from "../service/StaffAuthService.js";
import { StaffAuthResponse, StaffProfileResponse } from "../api/StaffAuthApi.js";
import { requireStaff } from "../middleware/auth.js";
import { StaffId } from "../schema/Ids.js";

// ============================================================
// Staff Auth Handler Implementation
// ============================================================

export const StaffAuthHandler = HttpApiBuilder.group(Api, "staff-auth", (handlers) =>
  handlers
    .handle("login", ({ payload }) =>
      Effect.gen(function* () {
        const authService = yield* StaffAuthService;
        const result = yield* authService.login(payload.username, payload.password);

        return new StaffAuthResponse({
          staffId: result.staffId,
          username: result.username,
          firstName: result.firstName,
          lastName: result.lastName,
          storeId: result.storeId,
          token: result.token,
        });
      }).pipe(
        Effect.mapError((err: any) => {
          if (err._tag === "StaffNotFoundError") {
            return new StaffAuthError({ message: "Invalid username or password" });
          }
          if (err._tag === "StaffInvalidPasswordError") {
            return new StaffAuthError({ message: "Invalid username or password" });
          }
          if (err._tag === "StaffInactiveError") {
            return new StaffAuthError({ message: "Account is inactive" });
          }
          return new StaffAuthError({ message: "Authentication failed" });
        })
      )
    )
    // Protected: requires staff authentication
    .handle("profile", ({ params }) =>
      Effect.gen(function* () {
        yield* requireStaff;
        
        // Only allow accessing own profile (or any profile for staff)
        const authService = yield* StaffAuthService;
        const profile = yield* authService.getProfile(params.staffId as StaffId);

        if (!profile) {
          return yield* Effect.fail(new StaffAuthError({ message: "Staff not found" }));
        }

        return new StaffProfileResponse({
          staffId: profile.staffId,
          username: profile.username,
          email: profile.email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          storeId: profile.storeId,
          isActive: profile.isActive,
        });
      }).pipe(
        Effect.mapError((err: any) => {
          if (err._tag === "StaffAuthError") return err;
          if (err instanceof Error && err.message.includes("Authorization")) {
            return new StaffAuthError({ message: "Authentication required" });
          }
          return new StaffAuthError({ message: "Failed to get profile" });
        })
      )
    )
    // Protected: requires staff authentication
    .handle("updatePassword", ({ params, payload }) =>
      Effect.gen(function* () {
        const authUser = yield* requireStaff;
        
        // Only allow updating own password
        if (authUser.id !== params.staffId) {
          return yield* Effect.fail(new StaffAuthError({ message: "Access denied" }));
        }

        const authService = yield* StaffAuthService;
        yield* authService.updatePassword(
          params.staffId as StaffId,
          payload.currentPassword,
          payload.newPassword
        );
        return { success: true };
      }).pipe(
        Effect.mapError((err: any) => {
          if (err._tag === "StaffInvalidPasswordError") {
            return new StaffAuthError({ message: "Current password is incorrect" });
          }
          if (err._tag === "StaffNotFoundError") {
            return new StaffAuthError({ message: "Staff not found" });
          }
          if (err instanceof Error && err.message.includes("Authorization")) {
            return new StaffAuthError({ message: "Authentication required" });
          }
          return new StaffAuthError({ message: "Failed to update password" });
        })
      )
    )
    // Protected: requires staff authentication
    .handle("list", () =>
      Effect.gen(function* () {
        yield* requireStaff; // Require authentication

        const authService = yield* StaffAuthService;
        const staffList = yield* authService.listStaff();

        return staffList.map(staff => new StaffProfileResponse({
          staffId: staff.staffId,
          username: staff.username,
          email: staff.email,
          firstName: staff.firstName,
          lastName: staff.lastName,
          storeId: staff.storeId,
          isActive: staff.isActive,
        }));
      }).pipe(
        Effect.mapError((err: any) => {
          if (err instanceof Error && err.message.includes("Authorization")) {
            return new StaffAuthError({ message: "Authentication required" });
          }
          return new StaffAuthError({ message: "Failed to list staff" });
        })
      )
    )
);
