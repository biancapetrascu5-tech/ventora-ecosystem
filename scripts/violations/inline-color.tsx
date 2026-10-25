// Violation: hardcoded hex color in style prop + Tailwind arbitrary color.
// Expected: no-restricted-syntax [no-inline-color] and [no-tailwind-arbitrary-color] errors.
export function Box() {
  return (
    <div
      style={{ color: '#ff0000' }}
      className="text-[#ff0000] font-bold"
    >
      Red
    </div>
  );
}
