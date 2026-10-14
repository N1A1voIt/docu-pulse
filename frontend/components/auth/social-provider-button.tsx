"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import type { ProviderMeta } from "@/lib/auth-providers";

export interface SocialProviderButtonProps {
  provider: ProviderMeta;
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

function Spinner() {
  return (
    <span
      className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      role="status"
      aria-label="Loading"
    />
  );
}

export function SocialProviderButton({
  provider,
  loading = false,
  disabled = false,
  onClick,
  className,
}: SocialProviderButtonProps) {
  const Icon = provider.Icon;
  const isDisabled = disabled || loading;

  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={isDisabled}
      aria-busy={loading}
      className={cn(
        "w-full h-11 justify-start gap-3 px-4",
        className,
      )}
    >
      <Icon className="size-5" />
      <span className="flex-1 text-left">Continue with {provider.label}</span>
      {loading ? <Spinner /> : null}
    </Button>
  );
}
