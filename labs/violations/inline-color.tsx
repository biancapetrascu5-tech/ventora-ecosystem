// VIOLATION: no-restricted-syntax (inlineColor, tailwindArbitraryColor)
// Proves the design-tokens guard works: hardcoded hex/rgb colors and Tailwind arbitrary values are forbidden.
export function ViolationColor() {
  return (
    <div
      style={{ color: '#ff0000', backgroundColor: 'rgb(0, 0, 255)' }}
      className="mt-4 bg-[#123456]"
    >
      Violation
    </div>
  );
}
