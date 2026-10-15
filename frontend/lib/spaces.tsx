"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { apiFetch } from "@/lib/api";

/**
 * Mirrors the backend `OrganizationForUser` (backend/src/organizations/types.ts),
 * which `GET /api/organizations` returns: one call answers "which spaces, on
 * what plan, in what role".
 */
export interface Space {
  id: string;
  name: string;
  slug: string;
  isPersonal: boolean;
  planId: string;
  planName: string | null;
  role: string | null;
}

export interface SessionUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

/** Mirrors the load branches the pre-shell pages already used. */
export type SpacesStatus = "loading" | "unauth" | "error" | "ok";

interface SpacesContextValue {
  status: SpacesStatus;
  error: string | null;
  spaces: Space[];
  user: SessionUser | null;
  /** Re-runs the session + spaces load, surfacing the existing loading state. */
  reload: () => void;
  /**
   * Creates a team space, refreshes the list so the new space is available to
   * the switcher, and resolves with the new space id. Throws on failure.
   */
  createSpace: (name: string) => Promise<{ id: string }>;
}

const SpacesContext = createContext<SpacesContextValue | null>(null);

/**
 * Owns the user's spaces + session for the whole product surface. Route-agnostic
 * on purpose: it never reads the active space, so it can sit above the pages
 * without depending on route data (which suspends under cacheComponents).
 */
export function SpaceProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SpacesStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [attempt, setAttempt] = useState(0);

  const fetchSpaces = useCallback(async (): Promise<Space[]> => {
    const res = await apiFetch("/api/organizations");
    if (!res.ok) {
      throw new Error(`Failed to load spaces (${res.status})`);
    }
    return (await res.json()) as Space[];
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { data } = await authClient.getSession();
        if (cancelled) return;
        if (!data?.user) {
          setUser(null);
          setSpaces([]);
          setStatus("unauth");
          return;
        }
        setUser(data.user);

        const list = await fetchSpaces();
        if (cancelled) return;
        setSpaces(list);
        setError(null);
        setStatus("ok");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load spaces");
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt, fetchSpaces]);

  const reload = useCallback(() => {
    setError(null);
    setStatus("loading");
    setAttempt((n) => n + 1);
  }, []);

  const createSpace = useCallback(
    async (name: string): Promise<{ id: string }> => {
      const res = await apiFetch("/api/organizations", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        id?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || !body.id) {
        throw new Error(
          body.message ?? body.error ?? "Couldn’t create the team space",
        );
      }
      // Refresh the list so the new space is present in the switcher before we
      // navigate into it — the provider stays the one source of truth.
      try {
        setSpaces(await fetchSpaces());
      } catch {
        // Navigation still proceeds; the next load picks the space up.
      }
      return { id: body.id };
    },
    [fetchSpaces],
  );

  const value = useMemo<SpacesContextValue>(
    () => ({ status, error, spaces, user, reload, createSpace }),
    [status, error, spaces, user, reload, createSpace],
  );

  return <SpacesContext.Provider value={value}>{children}</SpacesContext.Provider>;
}

export function useSpaces(): SpacesContextValue {
  const ctx = useContext(SpacesContext);
  if (!ctx) {
    throw new Error("useSpaces must be used within a SpaceProvider");
  }
  return ctx;
}

/** Finds a space in an already-loaded list; never fetches. */
export function findSpace(
  spaces: Space[],
  id: string | null | undefined,
): Space | null {
  if (!id) return null;
  return spaces.find((s) => s.id === id) ?? null;
}

/**
 * Display-only mirror of the server rule in
 * backend/src/entitlements/canInvite.ts (non-personal AND plan_name === "Org").
 * The server stays the enforcement point.
 */
export function documentsUnlockedFor(space: Space | null): boolean {
  return space !== null && !space.isPersonal && space.planName === "Org";
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

/** Human-readable label for a `role.slug`; falls back to the raw slug, or "—" when absent. */
export function roleLabel(role: string | null): string {
  if (!role) return "—";
  return ROLE_LABELS[role] ?? role;
}

const SPACE_ROUTE = /^\/orgs\/([^/]+)/;

/**
 * The active space, derived from the route — never stored.
 *
 * Reads `usePathname()` rather than `useParams()`: this hook is consumed by the
 * shell chrome in `app/(app)/layout.tsx`, which sits *above* the `[id]` segment,
 * where `useParams()` returns `{}` (params are only visible from the segment
 * that declares them). The pathname is unambiguous at any depth.
 *
 * Under `cacheComponents: true` the pathname suspends for `/orgs/[id]` (it has
 * no `generateStaticParams`), so any consumer must render inside a `Suspense`
 * boundary.
 */
export function useActiveSpace() {
  const pathname = usePathname();
  const { spaces } = useSpaces();

  const activeSpaceId = useMemo(() => {
    const match = pathname?.match(SPACE_ROUTE);
    return match ? decodeURIComponent(match[1]) : null;
  }, [pathname]);

  const activeSpace = useMemo(
    () => findSpace(spaces, activeSpaceId),
    [spaces, activeSpaceId],
  );

  return {
    activeSpaceId,
    activeSpace,
    documentsUnlocked: documentsUnlockedFor(activeSpace),
  };
}
