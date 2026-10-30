/* eslint-disable i18next/no-literal-string -- datele de exemplu din preview.html */
'use client';

import { useState } from 'react';
import { OpenSupportDialog } from '@ventora/screens';
import { FounderBusinessDemo } from '../_shared/founderBusiness';
import b from '../_shared/founderBusiness.module.css';

export function Frame() {
  const [reason, setReason] = useState(
    'Programările de joi nu apar în calendar; verific setările EasyBook.',
  );
  const [ticket, setTicket] = useState('VS-2026-0142');
  const [duration, setDuration] = useState('60');
  return (
    <div className={b.frame}>
      <div className={b.body}>
        <FounderBusinessDemo />
      </div>
      <div className={b.overlay}>
        <OpenSupportDialog
          inline
          reason={reason}
          ticket={ticket}
          duration={duration}
          onReasonChange={setReason}
          onTicketChange={setTicket}
          onDurationChange={setDuration}
        />
      </div>
    </div>
  );
}
