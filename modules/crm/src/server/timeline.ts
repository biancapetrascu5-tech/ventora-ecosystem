import type { TenantContext } from '@ventora/access';
import { listFiles } from '@ventora/files';
import { withCrmTx } from './db';
import type { ContactScope } from './contacts';
import { doneActivitiesOf, type Activity } from './activities';
import { CRM_FILE_MODULE, toAttachment, type Attachment } from './attachments';
import { NOTE_COLUMNS, toNote, type Note, type NoteRow } from './notes';
import { mergedFamily, readSubject, requireSubjectType } from './subjects';
import { page } from './validation';

/*
 * Lot CR.6 — „Un singur istoric” (S130): the notes, the comments and the files of a record, newest
 * first. A contact's history includes the files of the contacts merged into it (CR.5; their notes
 * were moved at the merge). CR.7: the done activities. Deals, EasyBook bookings, e-mails, consent and field changes
 * join it with their lots (field changes need an audit filter by target in core/audit: proposal).
 */

export type TimelineItem =
  | { type: 'note' | 'comment'; at: Date; note: Note }
  | { type: 'file'; at: Date; file: Attachment }
  | { type: 'activity'; at: Date; activity: Activity };

export async function getTimelineInOrg(
  ctx: TenantContext,
  scope: ContactScope,
  params: { subjectType?: unknown; subjectId?: unknown; limit?: unknown; offset?: unknown },
): Promise<{ items: TimelineItem[]; hasMore: boolean }> {
  const type = requireSubjectType(params.subjectType);
  const { limit, offset } = page(params);
  const want = offset + limit + 1;

  const { notes, activities, owners } = await withCrmTx(
    ctx.organizationId,
    async (client) => {
      const subject = await readSubject(client, ctx, scope, type, params.subjectId);
      const ids = type === 'contact' ? await mergedFamily(client, subject.id) : [subject.id];
      const { rows } = await client.query<NoteRow>(
        `SELECT ${NOTE_COLUMNS} FROM crm.note
          WHERE subject_type = $1 AND subject_id = $2 AND deleted_at IS NULL
          ORDER BY created_at DESC, id DESC
          LIMIT $3`,
        [type, subject.id, want],
      );
      // CR.7: the done activities (a ticked task, a logged call or meeting, S131)
      const done = await doneActivitiesOf(client, type, subject.id, want);
      return { notes: rows.map(toNote), activities: done, owners: ids };
    },
    true,
  );

  const files = (
    await Promise.all(
      owners.map((id) =>
        listFiles(
          { organizationId: ctx.organizationId, userId: ctx.userId },
          { module: CRM_FILE_MODULE, resourceType: type, resourceId: id },
        ),
      ),
    )
  )
    .flat()
    .map(toAttachment);

  const items: TimelineItem[] = [
    ...notes.map((n) => ({ type: n.kind, at: n.createdAt, note: n })),
    ...files.map((f) => ({ type: 'file' as const, at: f.createdAt, file: f })),
    ...activities.map((a) => ({
      type: 'activity' as const,
      at: a.doneAt ?? a.createdAt,
      activity: a,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return { items: items.slice(offset, offset + limit), hasMore: items.length > offset + limit };
}
