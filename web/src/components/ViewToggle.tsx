/** 2+ button segmented control — one inset track, the active thumb is the raised surface.
 *  Used for the card/table layout switch, the grouped/flat view switch, and the analytics range.
 *  `aria-pressed` (not `.on`) is what drives the active styling, so the visual state and the
 *  accessibility state can never drift apart. */
export function ViewToggle<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
