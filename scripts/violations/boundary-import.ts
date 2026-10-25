// Violation: imports directly from module internals (not via @ventora/* package).
// Expected: boundaries/dependencies error.
import type { InternalBookingService } from '../../modules/booking/src/internal-service';

export type { InternalBookingService };
