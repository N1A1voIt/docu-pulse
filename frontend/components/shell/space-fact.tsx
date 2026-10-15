/**
 * A single read-only space fact (term/definition) shared by the Overview and
 * Settings routes. Presentation only — the caller supplies the `<dl>`.
 */
export function SpaceFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
