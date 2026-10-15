"use client";

import Link from "next/link";

import { useActiveSpace } from "@/lib/spaces";

/**
 * `DocuPulse › {Space}` on a space route, `DocuPulse` alone on `/`. The space
 * segment is omitted (not greyed) when no space is in the route, so Home reads
 * as its own place rather than a space that failed to load.
 */
export function BreadcrumbChip() {
  const { activeSpace } = useActiveSpace();

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 rounded-full bg-muted/50 px-3 py-1 text-sm">
        <li className="min-w-0">
          <Link href="/" className="font-medium hover:underline">
            DocuPulse
          </Link>
        </li>
        {activeSpace && (
          <li className="flex min-w-0 items-center gap-1.5">
            <span aria-hidden="true" className="text-muted-foreground">
              ›
            </span>
            <Link
              href={`/orgs/${activeSpace.id}`}
              className="min-w-0 truncate text-muted-foreground hover:text-foreground hover:underline"
            >
              {activeSpace.name}
            </Link>
          </li>
        )}
      </ol>
    </nav>
  );
}
