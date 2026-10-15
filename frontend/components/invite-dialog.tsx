"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

export function InviteDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (email: string, role: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Esc, the backdrop and the close button all route through here, so every
  // dismissal path is handled by the dialog primitive.
  function handleOpenChange(next: boolean) {
    if (!next) onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onSubmit(email.trim(), role);
      setEmail("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      title="Invite member"
      initialFocus={inputRef}
    >
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Email</span>
          <Input
            ref={inputRef}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-md border px-2 py-1 text-sm"
          >
            <option value="owner">owner</option>
            <option value="admin">admin</option>
            <option value="member">member</option>
          </select>
        </label>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Inviting…" : "Invite"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
