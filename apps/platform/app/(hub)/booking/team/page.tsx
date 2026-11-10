import { permanentRedirect } from 'next/navigation';

/* Lot B.2-UI (decision 2): the Spine's „Echipa” opens Setări · „Programul echipei”. */
export default function BookingTeamRedirect(): never {
  permanentRedirect('/booking/settings/team');
}
