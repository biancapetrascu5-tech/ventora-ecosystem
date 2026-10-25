// Violation: native <select> instead of @ventora/ui Select.
// Expected: no-restricted-syntax [no-native-select] error.
export function Filter() {
  return (
    <select>
      <option value="a">A</option>
      <option value="b">B</option>
    </select>
  );
}
