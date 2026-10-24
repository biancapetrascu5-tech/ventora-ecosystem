// VIOLATION: i18next/no-literal-string
// Proves the hardcoded-text guard works: JSX literal strings must use i18n.
export function ViolationText() {
  return <p>This text should be internationalized</p>;
}
