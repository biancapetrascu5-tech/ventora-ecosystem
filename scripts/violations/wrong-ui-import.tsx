// Violation: Button imported from wrong path (not @ventora/ui).
// Expected: no-restricted-syntax [no-wrong-ui-import] error.
import { Button } from '../../packages/ui/src/Button';

export function Foo() {
  return <Button>Click</Button>;
}
