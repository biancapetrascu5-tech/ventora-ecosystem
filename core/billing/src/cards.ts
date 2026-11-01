import { InvalidInput } from '@ventora/errors';
import { assertBuyer, recordCardInTx, type BillingContext, type SavedCard } from './account';
import { withBillingWrite } from './db';
import { reconcileSubscription } from './subscriptions';

/**
 * After the card is confirmed in Stripe Elements: recorded at once (the webhook does the same,
 * whichever comes first), then the subscription is charged with it (D3-4). A card that is not
 * this business's, or a SetupIntent not confirmed, records nothing.
 */
export async function confirmCardSetup(
  ctx: BillingContext,
  setupIntentId: string,
): Promise<{ card: SavedCard | null }> {
  assertBuyer(ctx);
  if (!/^seti_[A-Za-z0-9]+$/.test(setupIntentId ?? '')) throw new InvalidInput('setupIntentId');
  const { card } = await withBillingWrite(ctx.organizationId, (client, exec) =>
    recordCardInTx(client, exec, {
      organizationId: ctx.organizationId,
      setupIntentId,
      actorUserId: ctx.userId,
    }),
  );
  if (card) await reconcileSubscription(ctx.organizationId);
  return { card };
}
