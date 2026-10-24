// VIOLATION: no-restricted-syntax (wrongUiImport)
// Proves the common-components guard works: importing Button from outside @ventora/ui is forbidden.
import { Button } from '../components/Button';
export function ViolationImport() {
  return <Button>Submit</Button>;
}
