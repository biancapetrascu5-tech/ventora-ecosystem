// VIOLATION: boundaries/dependencies
// Proves the boundary guard works: labs cannot import from modules directly.
// Only imports via packages/* are allowed from labs/*.
import { InternalBookingService } from '../../modules/booking/src/internal-service';
export const _service: InternalBookingService = { id: 'violation' };
