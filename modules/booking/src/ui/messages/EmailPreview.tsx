'use client';

import { Avatar } from '@ventora/ui';
import s from './messages.module.css';

/* BookingMessageTemplates (S127) · „Previzualizare”: the e-mail as the client sees it, in the single
   template of BookingClientEmails (always light, like the inbox). The parts come from the server
   (previewMessageTemplate → clientEmailParts), so the preview is the e-mail that leaves. */

export type EmailPreviewData = {
  fromLabel: string;
  toLabel: string;
  from: string;
  to: string;
  subject: string;
  preheader: string;
  business: string;
  title: string;
  /** The greeting and the text, as paragraphs. */
  paragraphs: string[];
  /** The appointment block („Serviciu: Tuns”), shown as label / value. */
  rows: string[];
  button?: string | null;
  after?: string[];
  why: string;
  foot: string;
};

const pair = (row: string): [string, string] => {
  const i = row.indexOf(': ');
  return i < 0 ? [row, ''] : [row.slice(0, i), row.slice(i + 2)];
};

export function EmailPreview({ m }: { m: EmailPreviewData }) {
  return (
    <div className={s.mail}>
      <div className={s.em} data-theme="light" style={{ width: '100%' }}>
        <div className={s.inbox}>
          <p className={`caption ${s.mute}`}>
            {m.fromLabel}: {m.from} · {m.toLabel}: {m.to}
          </p>
          <p className="body-strong">{m.subject}</p>
          <p className={`body-small ${s.mute}`}>{m.preheader}</p>
        </div>
        <div className={s.canvas}>
          <div className={s.card}>
            <div className={s.head}>
              <span className={s.row}>
                <Avatar name={m.business} shape="square" size="sm" />
                <span className="body-strong">{m.business}</span>
              </span>
            </div>
            <div className={s.mbody}>
              <h1 className={`heading ${s.title}`}>{m.title}</h1>
              {m.paragraphs.slice(0, 2).map((p, i) => (
                <p key={i} className="body">
                  {p}
                </p>
              ))}
              {m.rows.length ? (
                <dl className={s.kv}>
                  {m.rows.map((r) => {
                    const [k, v] = pair(r);
                    return (
                      <div key={r} style={{ display: 'contents' }}>
                        <dt className="caption">{k}</dt>
                        <dd className="body">{v}</dd>
                      </div>
                    );
                  })}
                </dl>
              ) : null}
              {m.paragraphs.slice(2).map((p, i) => (
                <p key={`x${i}`} className="body">
                  {p}
                </p>
              ))}
              {m.button ? (
                <a className={`${s.btn} body-strong`} href="#" onClick={(e) => e.preventDefault()}>
                  {m.button}
                </a>
              ) : null}
              {(m.after ?? []).map((a) => (
                <p key={a} className={`body-small ${s.mute}`}>
                  {a}
                </p>
              ))}
            </div>
          </div>
          <div className={s.foot}>
            <p className={`caption ${s.mute}`}>{m.why}</p>
            <p className={`caption ${s.mute}`}>{m.foot}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
