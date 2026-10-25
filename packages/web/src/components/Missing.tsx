// What a disabled button waits for (change 0088-buttons-say-why): a line under it, so a greyed-out action is never
// a dead end.
export function Missing({ text }: { text: string | null | false | undefined }) {
  return text ? (
    <p className="missing-hint" role="note" data-testid="missing">
      {text}
    </p>
  ) : null;
}
