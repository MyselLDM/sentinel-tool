"use server";

import { redirect } from "next/navigation";

import { ApiError, login, register } from "@/lib/api/auth";
import { safeNextPath } from "@/lib/auth/config";
import { createSession } from "@/lib/auth/session";

/**
 * Server Actions for the `/login` surface (sign in **and** create account).
 *
 * Each action validates input, talks to the gateway, stores the returned token
 * pair in the httpOnly session cookie, then redirects. Failures come back as
 * state so the form can render inline errors without throwing.
 */

export type AuthFormState = {
  /** Form-level message (never leaks whether an email exists). */
  message?: string;
  /** Per-field messages keyed by input `name`. */
  fieldErrors?: Record<string, string>;
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD_LENGTH = 12; // mirrors the gateway's register schema

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/**
 * Fixed, non-enumerating copy for auth failures. We deliberately map the
 * gateway's error *code* to our own strings rather than echoing the upstream
 * message (which is attacker-influenced text and reveals account existence).
 */
function authErrorMessage(error: ApiError, mode: "signin" | "signup"): string {
  switch (error.code) {
    case "INVALID_CREDENTIALS":
      return "Invalid email or password.";
    case "CONFLICT":
      return mode === "signup"
        ? "We couldn't create an account with those details. If you already have one, sign in instead."
        : "Invalid email or password.";
    case "VALIDATION_ERROR":
      return "Please check the highlighted fields and try again.";
    case "RATE_LIMITED":
      return "Too many attempts. Please wait a minute and try again.";
    case "UPSTREAM_UNAVAILABLE":
      return "Could not reach the Sentinel gateway. Please try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

/**
 * Run an auth call and persist the session. Returns an error state, or `null`
 * on success — the caller is then responsible for redirecting (which must sit
 * outside this function, since `redirect()` throws).
 */
async function establishSession(
  mode: "signin" | "signup",
  run: () => Promise<{ accessToken: string; refreshToken: string }>,
): Promise<AuthFormState | null> {
  try {
    const session = await run();
    await createSession({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    });
    return null;
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        message: authErrorMessage(error, mode),
        fieldErrors: error.code === "VALIDATION_ERROR" ? error.fieldErrors : undefined,
      };
    }
    return { message: "Something went wrong. Please try again." };
  }
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = field(formData, "email").trim();
  const password = field(formData, "password");
  const next = safeNextPath(formData.get("next"));

  const fieldErrors: Record<string, string> = {};
  if (!email) fieldErrors.email = "Enter your email address.";
  else if (!EMAIL_RE.test(email)) fieldErrors.email = "Enter a valid email address.";
  if (!password) fieldErrors.password = "Enter your password.";

  if (Object.keys(fieldErrors).length > 0) {
    return { message: "Please fix the highlighted fields.", fieldErrors };
  }

  const failure = await establishSession("signin", () => login(email, password));
  if (failure) return failure;

  redirect(next);
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = field(formData, "email").trim();
  const fullName = field(formData, "fullName").trim();
  const password = field(formData, "password");
  const confirmPassword = field(formData, "confirmPassword");
  const next = safeNextPath(formData.get("next"));

  const fieldErrors: Record<string, string> = {};
  if (!email) fieldErrors.email = "Enter your email address.";
  else if (!EMAIL_RE.test(email)) fieldErrors.email = "Enter a valid email address.";
  if (!password) fieldErrors.password = "Choose a password.";
  else if (password.length < MIN_PASSWORD_LENGTH) {
    fieldErrors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (confirmPassword !== password) fieldErrors.confirmPassword = "Passwords do not match.";
  if (fullName.length > 100) fieldErrors.fullName = "Keep your name under 100 characters.";

  if (Object.keys(fieldErrors).length > 0) {
    return { message: "Please fix the highlighted fields.", fieldErrors };
  }

  const failure = await establishSession("signup", () =>
    register(fullName ? { email, password, fullName } : { email, password }),
  );
  if (failure) return failure;

  redirect(next);
}
