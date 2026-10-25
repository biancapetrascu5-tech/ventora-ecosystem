// Violation: hardcoded JSX literal string.
// Expected: i18next/no-literal-string error.
export function Banner() {
  return <div>Bun venit!</div>;
}
