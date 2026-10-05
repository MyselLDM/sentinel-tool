"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Loader2, Plus, Trash2, TriangleAlert, X } from "lucide-react";

import { cn } from "@/lib/cn";
import {
  createKeyAction,
  deleteKeyAction,
  updateKeyAction,
} from "./actions";
import type { ActionResult, ApiKey, CreateKeyInput } from "./actions";

// ── Utility ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Modal primitive ───────────────────────────────────────────────────────────

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      el.showModal();
    } else {
      el.close();
    }
  }, [open]);

  // Close on backdrop click
  const onClickBackdrop = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={onClickBackdrop}
      className="modal modal-bottom sm:modal-middle backdrop:bg-heading/20 backdrop:backdrop-blur-sm"
    >
      <div className="modal-box rounded-xl border border-border bg-surface p-0 shadow-lg sm:max-w-lg">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-heading">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-page hover:text-heading"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </dialog>
  );
}

// ── Alert banner ──────────────────────────────────────────────────────────────

function Alert({
  type,
  message,
  onClose,
}: {
  type: "error" | "success";
  message: string;
  onClose?: () => void;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-lg border p-4 text-sm",
        type === "error"
          ? "border-error-red/20 bg-error-bg text-error-red"
          : "border-success-green/20 bg-success-bg text-success-green",
      )}
    >
      {type === "error" ? (
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <Check className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <span className="flex-1 leading-relaxed">{message}</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="opacity-60 hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ── One-time Secret Reveal Modal ──────────────────────────────────────────────

function SecretRevealModal({
  apiKey,
  keyName,
  onClose,
}: {
  apiKey: string;
  keyName: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  return (
    <Modal open title={`Key created: ${keyName}`} onClose={onClose}>
      <div className="space-y-5">
        {/* Warning */}
        <div className="flex items-start gap-3 rounded-lg border border-warning-amber/20 bg-warning-bg p-4">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-amber" />
          <p className="text-sm leading-relaxed text-body">
            <strong className="text-heading">Save this key now.</strong> It will not be shown again.
            Sentinel stores only a hash — there is no way to recover the plaintext secret after this
            dialog is closed.
          </p>
        </div>

        {/* Key display */}
        <div>
          <p className="mb-2 text-sm font-medium text-heading">API key (shown once)</p>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-page p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-sm leading-relaxed text-heading">
              {apiKey}
            </code>
            <button
              type="button"
              onClick={() => void copy()}
              aria-label="Copy API key to clipboard"
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-border-strong hover:text-heading"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-success-green" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-lg bg-primary-blue py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-hover"
        >
          I have saved my key
        </button>
      </div>
    </Modal>
  );
}

// ── Create Key Modal ──────────────────────────────────────────────────────────

function CreateKeyModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (key: string, record: ApiKey) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setError(null);
    setFieldErrors({});
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const keyName = (fd.get("keyName") as string).trim();
    const rateRaw = fd.get("rateLimitPerMinute") as string;
    const expiresAtRaw = fd.get("expiresAt") as string;

    // Basic client-side validation
    if (!keyName) {
      setFieldErrors({ keyName: "Key name is required." });
      return;
    }

    const input: CreateKeyInput = { keyName };

    if (rateRaw && rateRaw !== "") {
      const rate = parseInt(rateRaw, 10);
      if (isNaN(rate) || rate < 1 || rate > 10000) {
        setFieldErrors({ rateLimitPerMinute: "Must be between 1 and 10 000." });
        return;
      }
      input.rateLimitPerMinute = rate;
    }

    if (expiresAtRaw && expiresAtRaw !== "") {
      const dt = new Date(expiresAtRaw);
      if (isNaN(dt.getTime()) || dt <= new Date()) {
        setFieldErrors({ expiresAt: "Expiry must be in the future." });
        return;
      }
      input.expiresAt = dt.toISOString();
    }

    setLoading(true);
    setError(null);
    setFieldErrors({});

    const result: ActionResult<{ key: string; record: ApiKey }> =
      await createKeyAction(input);

    setLoading(false);

    if (!result.ok) {
      setError(result.message);
      if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      return;
    }

    handleClose();
    onCreated(result.data.key, result.data.record);
  };

  return (
    <Modal open={open} onClose={handleClose} title="Create API key">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5" noValidate>
        {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

        {/* Key name */}
        <fieldset className="fieldset">
          <legend className="fieldset-legend">Key name *</legend>
          <input
            id="keyName"
            name="keyName"
            type="text"
            required
            maxLength={100}
            placeholder="e.g. Thesis eval key"
            className={cn("input w-full", fieldErrors.keyName && "input-error")}
            aria-describedby={fieldErrors.keyName ? "keyName-error" : undefined}
            aria-invalid={Boolean(fieldErrors.keyName)}
          />
          {fieldErrors.keyName && (
            <p id="keyName-error" className="label text-error">
              {fieldErrors.keyName}
            </p>
          )}
        </fieldset>

        {/* Rate limit */}
        <fieldset className="fieldset">
          <legend className="fieldset-legend">Rate limit (req / min)</legend>
          <input
            id="rateLimitPerMinute"
            name="rateLimitPerMinute"
            type="number"
            min={1}
            max={10000}
            placeholder="60"
            className={cn("input w-full", fieldErrors.rateLimitPerMinute && "input-error")}
            aria-describedby={
              fieldErrors.rateLimitPerMinute ? "rateLimit-error" : "rateLimit-hint"
            }
            aria-invalid={Boolean(fieldErrors.rateLimitPerMinute)}
          />
          {fieldErrors.rateLimitPerMinute ? (
            <p id="rateLimit-error" className="label text-error">
              {fieldErrors.rateLimitPerMinute}
            </p>
          ) : (
            <p id="rateLimit-hint" className="label">
              Leave blank to use the server default.
            </p>
          )}
        </fieldset>

        {/* Expires at */}
        <fieldset className="fieldset">
          <legend className="fieldset-legend">Expires at</legend>
          <input
            id="expiresAt"
            name="expiresAt"
            type="datetime-local"
            className={cn("input w-full", fieldErrors.expiresAt && "input-error")}
            aria-describedby={fieldErrors.expiresAt ? "expiresAt-error" : "expiresAt-hint"}
            aria-invalid={Boolean(fieldErrors.expiresAt)}
          />
          {fieldErrors.expiresAt ? (
            <p id="expiresAt-error" className="label text-error">
              {fieldErrors.expiresAt}
            </p>
          ) : (
            <p id="expiresAt-hint" className="label">
              Leave blank for a key that never expires.
            </p>
          )}
        </fieldset>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={loading}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary-blue text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Create key
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-muted transition-colors hover:bg-page hover:text-heading"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Delete Confirmation Modal ─────────────────────────────────────────────────

function DeleteKeyModal({
  target,
  onClose,
  onDeleted,
}: {
  target: ApiKey | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setError(null);
    setLoading(false);
    onClose();
  };

  const handleDelete = async () => {
    if (!target) return;
    setLoading(true);
    setError(null);
    const result = await deleteKeyAction(target.id);
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    handleClose();
    onDeleted(target.id);
  };

  return (
    <Modal open={Boolean(target)} onClose={handleClose} title="Delete API key">
      {target && (
        <div className="space-y-5">
          {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

          <p className="text-sm leading-relaxed text-muted">
            Are you sure you want to permanently delete the key{" "}
            <span className="font-medium text-heading">{target.keyName}</span>?{" "}
            Any agents using this key will be immediately rejected.
          </p>

          <div className="rounded-lg border border-border bg-page p-3">
            <p className="text-xs font-medium text-muted mb-1">Key</p>
            <p className="font-mono text-sm text-heading">
              {target.prefix}…{target.last4}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={loading}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-error-red text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700 disabled:pointer-events-none disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <Trash2 className="h-4 w-4" />
              Delete key
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-muted transition-colors hover:bg-page hover:text-heading"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function KeyStatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        active
          ? "bg-success-bg text-success-green"
          : "bg-page text-muted",
      )}
    >
      <span
        className={cn(
          "block h-1.5 w-1.5 rounded-full",
          active ? "bg-success-green" : "bg-muted",
        )}
        aria-hidden
      />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

// ── Toggle Cell ───────────────────────────────────────────────────────────────

function ToggleCell({
  keyId,
  isActive,
  onToggled,
}: {
  keyId: string;
  isActive: boolean;
  onToggled: (updated: ApiKey) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    setLoading(true);
    setError(null);
    const result = await updateKeyAction(keyId, { isActive: !isActive });
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onToggled(result.data);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={loading}
        aria-label={isActive ? "Deactivate key" : "Activate key"}
        aria-pressed={isActive}
        className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-border-strong hover:text-heading disabled:pointer-events-none disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        {isActive ? "Deactivate" : "Activate"}
      </button>
      {error && (
        <span className="text-xs text-error-red" title={error}>
          Error
        </span>
      )}
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-light text-primary-blue">
        <Plus className="h-5 w-5" />
      </div>
      <div>
        <p className="font-medium text-heading">No API keys yet</p>
        <p className="mt-1 text-sm text-muted">
          Create your first key to start sending evaluations.
        </p>
      </div>
      <button
        type="button"
        onClick={onCreate}
        className="mt-2 flex h-10 items-center gap-2 rounded-lg bg-primary-blue px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-hover"
      >
        <Plus className="h-4 w-4" />
        Create API key
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ApiKeysClient({ initialKeys }: { initialKeys: ApiKey[] }) {
  const [keys, setKeys] = useState<ApiKey[]>(initialKeys);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null);
  const [newSecret, setNewSecret] = useState<{ key: string; record: ApiKey } | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const handleCreated = useCallback((key: string, record: ApiKey) => {
    setNewSecret({ key, record });
    setKeys((prev) => [record, ...prev]);
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setKeys((prev) => prev.filter((k) => k.id !== id));
  }, []);

  const handleToggled = useCallback((updated: ApiKey) => {
    setKeys((prev) => prev.map((k) => (k.id === updated.id ? updated : k)));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-primary-blue">
            <span aria-hidden className="block h-1.5 w-1.5 rounded-full bg-primary-blue" />
            Console
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-heading md:text-3xl">
            API keys
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            Issue, rate-limit and revoke the credentials your agents authenticate with. Plaintext
            keys are shown exactly once at creation.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-primary-blue px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" />
          New key
        </button>
      </div>

      {/* Global error */}
      {globalError && (
        <Alert type="error" message={globalError} onClose={() => setGlobalError(null)} />
      )}

      {/* Keys table */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        {keys.length === 0 ? (
          <EmptyState onCreate={() => setCreateOpen(true)} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] table-auto text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left">
                    <span className="text-xs font-medium text-muted">Name</span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="text-xs font-medium text-muted">Key</span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="text-xs font-medium text-muted">Rate limit</span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="text-xs font-medium text-muted">Created</span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="text-xs font-medium text-muted">Last used</span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="text-xs font-medium text-muted">Status</span>
                  </th>
                  <th className="px-4 py-3 text-left">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {keys.map((k) => (
                  <tr key={k.id} className="transition-colors hover:bg-page/60">
                    <td className="px-4 py-3">
                      <span className="font-medium text-heading">{k.keyName}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-muted" title="Prefix and last 4 chars">
                        {k.prefix}…{k.last4}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-heading">{k.rateLimitPerMinute} / min</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted" title={k.createdAt}>
                        {fmtDate(k.createdAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs text-muted"
                        title={k.lastUsedAt ?? undefined}
                      >
                        {k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : "Never"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <KeyStatusBadge active={k.isActive} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ToggleCell
                          keyId={k.id}
                          isActive={k.isActive}
                          onToggled={handleToggled}
                        />
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(k)}
                          aria-label={`Delete key ${k.keyName}`}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-error-bg hover:text-error-red"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateKeyModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />

      <DeleteKeyModal
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={handleDeleted}
      />

      {newSecret && (
        <SecretRevealModal
          apiKey={newSecret.key}
          keyName={newSecret.record.keyName}
          onClose={() => setNewSecret(null)}
        />
      )}
    </div>
  );
}
