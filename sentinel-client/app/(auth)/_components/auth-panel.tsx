"use client";

import { useActionState, useState } from "react";
import type { ReactNode } from "react";

import { signIn, signUp } from "@/app/(auth)/login/actions";
import type { AuthFormState } from "@/app/(auth)/login/actions";
import { cn } from "@/lib/cn";
import { SubmitButton } from "./submit-button";

type Tab = "signin" | "create";

const INITIAL: AuthFormState = {};

const COPY: Record<Tab, { title: string; subtitle: string; cta: string; pending: string }> = {
  signin: {
    title: "Sign in",
    subtitle: "Access the operator console for your key's traffic and logs.",
    cta: "Sign in",
    pending: "Signing in…",
  },
  create: {
    title: "Create your account",
    subtitle: "One account owns your API keys, evaluation logs and stats.",
    cta: "Create account",
    pending: "Creating account…",
  },
};

/** A single form control: daisyUI `fieldset` + `legend`, with inline error. */
function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="fieldset">
      <legend className="fieldset-legend">{label}</legend>
      {children}
      {error ? (
        <p id={`${id}-error`} className="label text-error">
          {error}
        </p>
      ) : hint ? (
        <p className="label">{hint}</p>
      ) : null}
    </fieldset>
  );
}

function FormAlert({ message }: { message: string }) {
  return (
    <div role="alert" className="alert alert-error alert-outline">
      <span>{message}</span>
    </div>
  );
}

function SignInForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(signIn, INITIAL);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-1">
      {state.message && <FormAlert message={state.message} />}
      <input type="hidden" name="next" value={next} />

      <Field id="email" label="Email" error={errors.email}>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          className="input w-full"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "email-error" : undefined}
        />
      </Field>

      <Field id="password" label="Password" error={errors.password}>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••••••"
          className="input w-full"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? "password-error" : undefined}
        />
      </Field>

      <div className="mt-4">
        <SubmitButton pendingLabel={COPY.signin.pending}>{COPY.signin.cta}</SubmitButton>
      </div>
    </form>
  );
}

function SignUpForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(signUp, INITIAL);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-1">
      {state.message && <FormAlert message={state.message} />}
      <input type="hidden" name="next" value={next} />

      <Field id="fullName" label="Full name" error={errors.fullName} hint="Optional.">
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          placeholder="Ada Lovelace"
          className="input w-full"
          aria-invalid={Boolean(errors.fullName)}
          aria-describedby={errors.fullName ? "fullName-error" : undefined}
        />
      </Field>

      <Field id="email" label="Email" error={errors.email}>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          className="input w-full"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "email-error" : undefined}
        />
      </Field>

      <Field
        id="password"
        label="Password"
        error={errors.password}
        hint="At least 12 characters."
      >
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          placeholder="••••••••••••"
          className="input w-full"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? "password-error" : undefined}
        />
      </Field>

      <Field id="confirmPassword" label="Confirm password" error={errors.confirmPassword}>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          placeholder="••••••••••••"
          className="input w-full"
          aria-invalid={Boolean(errors.confirmPassword)}
          aria-describedby={errors.confirmPassword ? "confirmPassword-error" : undefined}
        />
      </Field>

      <div className="mt-4">
        <SubmitButton pendingLabel={COPY.create.pending}>{COPY.create.cta}</SubmitButton>
      </div>
    </form>
  );
}

export function AuthPanel({
  defaultTab = "signin",
  next = "/dashboard",
  demoHint,
}: {
  defaultTab?: Tab;
  next?: string;
  /** Dev-only seed credentials, resolved on the server so they never enter the client bundle. */
  demoHint?: { email: string; password: string };
}) {
  const [tab, setTab] = useState<Tab>(defaultTab);
  const copy = COPY[tab];

  return (
    <div className="card border border-line bg-paper">
      <div className="card-body gap-0 p-6 sm:p-8">
        <h1 className="font-serif text-3xl leading-tight tracking-tight">{copy.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{copy.subtitle}</p>

        <div role="tablist" aria-label="Authentication" className="tabs tabs-box mt-6 w-full">
          {(["signin", "create"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={cn("tab flex-1", tab === value && "tab-active")}
              onClick={() => setTab(value)}
            >
              {value === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        {tab === "signin" ? <SignInForm next={next} /> : <SignUpForm next={next} />}

        {demoHint && (
          <div className="alert alert-info alert-outline mt-6 py-2.5 text-xs">
            <span>
              Dev seed — <span className="font-mono">{demoHint.email}</span> /{" "}
              <span className="font-mono">{demoHint.password}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
