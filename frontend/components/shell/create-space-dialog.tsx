"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

import { useSpaces } from "@/lib/spaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

interface CreateSpaceContextValue {
  /** Opens the one create-team dialog mounted in the shell. */
  open: () => void;
  /** Whether that dialog is currently open — lets other surfaces avoid stacking. */
  isOpen: boolean;
}

const CreateSpaceContext = createContext<CreateSpaceContextValue | null>(null);

export function useCreateSpace(): CreateSpaceContextValue {
  const ctx = useContext(CreateSpaceContext);
  if (!ctx) {
    throw new Error("useCreateSpace must be used within a CreateSpaceProvider");
  }
  return ctx;
}

/**
 * Mounts the create-team dialog exactly once for the product surface and exposes
 * a single opener. The rail's switcher footer and the Home empty state both call
 * it, so there is one dialog instance and one create path.
 */
export function CreateSpaceProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const value = useMemo<CreateSpaceContextValue>(
    () => ({ open, isOpen }),
    [open, isOpen],
  );

  return (
    <CreateSpaceContext.Provider value={value}>
      {children}
      <CreateSpaceDialog open={isOpen} onClose={close} />
    </CreateSpaceContext.Provider>
  );
}

function CreateSpaceDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { createSpace } = useSpaces();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    onClose();
    setError(null);
    setName("");
  }, [onClose]);

  // Base UI owns opening/closing; Esc, the backdrop and the close button all
  // arrive here, so a dismissal always clears the form state.
  function handleOpenChange(next: boolean) {
    if (!next) close();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const { id } = await createSpace(name);
      close();
      router.push(`/orgs/${id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn’t create the team space",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      title="Create team space"
      initialFocus={inputRef}
    >
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Name</span>
          <Input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={creating || name.trim() === ""}>
            {creating ? "Creating…" : "Create"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
