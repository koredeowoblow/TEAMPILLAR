/**
 * session.dto.js
 *
 * Shapes the auth session payload returned after login and token refresh.
 * Keeps token data clean and user data filtered through toUserDTO.
 */

import { toUserDTO } from "./user.dto.js";

/**
 * Login / token-refresh response shape.
 * Use in: AuthController.login, AuthController.refreshToken,
 *         SocialAuthService responses (googleAuth, appleAuth)
 *
 * NOTE: refreshToken is included here so the controller can set
 * the HttpOnly cookie. Consider stripping it from the JSON body
 * (set cookie only) once your frontend is ready — the field is
 * marked optional below as a reminder.
 */
export function toSessionDTO({ user, token, refreshToken, expiresAt }) {
  return {
    user:         toUserDTO(user),
    token,
    expiresAt,
    // refreshToken intentionally omitted from JSON body — it lives in the
    // HttpOnly cookie set by the controller. Remove the line below once
    // your client reads it only from the cookie.
    refreshToken,
  };
}