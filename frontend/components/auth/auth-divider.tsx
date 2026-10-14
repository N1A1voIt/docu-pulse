import * as React from "react";
import { cn } from "cn";

interface AuthDividerProps {
  label?: string;
  className?: string;
}

export function AuthDivider({ label = "or", className }: AuthDividerProps) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={label}
      className={cn("relative my-2 flex items-center", className)}
    >
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-border" />
      </div>
      <span className="relative mx-auto bg-card px-3 text-xs font-medium text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
