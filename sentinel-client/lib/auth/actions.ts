"use server";

import { redirect } from "next/navigation";

import { logout } from "@/lib/api/auth";
import { deleteSession, readSession } from "./session";

/**
 * Sign out: revoke the refresh token server-side (best effort), then drop the
 * session cookie and return to the login surface.
 */
export async function signOut(): Promise<void> {
  const tokens = await readSession();
  if (tokens) {
    try {
      await logout(tokens.refreshToken, tokens.accessToken);
    } catch {
      // Revocation is best-effort — the local cookie is cleared regardless.
    }
  }
  await deleteSession();
  redirect("/login");
}
