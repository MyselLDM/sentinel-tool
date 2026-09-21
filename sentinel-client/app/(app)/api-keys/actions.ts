"use server";

/**
 * Server Actions for API key management.
 * All mutations are server-side so the access token never reaches the browser.
 */

import { revalidatePath } from "next/cache";

import {
  createKey,
  deleteKey,
  listKeys,
  updateKey,
} from "@/lib/api/keys";
import type { ApiKey, CreateKeyInput, UpdateKeyInput } from "@/lib/api/keys";
import { readSession } from "@/lib/auth/session";

// Re-export types for client components
export type { ApiKey, CreateKeyInput, UpdateKeyInput };

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

async function getToken(): Promise<string> {
  const session = await readSession();
  if (!session) throw new Error("Not authenticated");
  return session.accessToken;
}

export async function fetchKeys(): Promise<ApiKey[]> {
  const token = await getToken();
  return listKeys(token);
}

export async function createKeyAction(
  input: CreateKeyInput,
): Promise<ActionResult<{ key: string; record: ApiKey }>> {
  try {
    const token = await getToken();
    const result = await createKey(token, input);
    revalidatePath("/api-keys");
    return { ok: true, data: result };
  } catch (err) {
    const e = err as { message?: string; fieldErrors?: Record<string, string> };
    return {
      ok: false,
      message: e.message ?? "Failed to create API key.",
      fieldErrors: e.fieldErrors,
    };
  }
}

export async function updateKeyAction(
  id: string,
  input: UpdateKeyInput,
): Promise<ActionResult<ApiKey>> {
  try {
    const token = await getToken();
    const record = await updateKey(token, id, input);
    revalidatePath("/api-keys");
    return { ok: true, data: record };
  } catch (err) {
    const e = err as { message?: string };
    return { ok: false, message: e.message ?? "Failed to update API key." };
  }
}

export async function deleteKeyAction(id: string): Promise<ActionResult> {
  try {
    const token = await getToken();
    await deleteKey(token, id);
    revalidatePath("/api-keys");
    return { ok: true, data: undefined };
  } catch (err) {
    const e = err as { message?: string };
    return { ok: false, message: e.message ?? "Failed to delete API key." };
  }
}
