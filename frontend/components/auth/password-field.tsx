"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

interface PasswordFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  disabled?: boolean;
  invalid?: boolean;
  helperText?: string;
  minLength?: number;
  id?: string;
}

export function PasswordField({
  label = "Password",
  value,
  onChange,
  autoComplete,
  disabled = false,
  invalid = false,
  helperText,
  minLength,
  id,
}: PasswordFieldProps) {
  const [show, setShow] = useState(false);
  const inputId = id ?? "password";

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <Input
          id={inputId}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          aria-invalid={invalid}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required
          minLength={minLength}
          className="pr-12"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-pressed={show}
          aria-label={show ? "Hide password" : "Show password"}
          aria-controls={inputId}
          disabled={disabled}
          className="absolute right-1 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          {show ? (
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M3 3l18 18" />
              <path d="M10.58 10.58a2 2 0 0 0 2.83 2.83" />
              <path d="M9.88 4.24A10.94 10.94 0 0 1 12 4c5 0 9 4 10 8a11.7 11.7 0 0 1-3.22 4.6" />
              <path d="M6.61 6.61A11.98 11.98 0 0 0 2 12a11.7 11.7 0 0 0 3.22 4.6" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {invalid && helperText ? (
        <span className="text-xs text-destructive" role="status">
          {helperText}
        </span>
      ) : null}
    </div>
  );
}
