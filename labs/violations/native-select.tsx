// VIOLATION: no-restricted-syntax (nativeSelect)
// Proves the common-components guard works: native <select> is forbidden; use Select from @ventora/ui.
export function ViolationSelect() {
  return (
    <select>
      <option value="a">A</option>
    </select>
  );
}
