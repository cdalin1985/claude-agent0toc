import webpush from 'npm:web-push';

type PushRow = { subscription?: webpush.PushSubscription } | null;
type QueryError = { message: string } | null;

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: PushRow; error: QueryError }>;
      };
    };
    delete: () => {
      eq: (column: string, value: string) => Promise<{ error: QueryError }>;
    };
  };
};

/**
 * Resolves VAPID credentials, or null (having logged why) when they are unusable.
 *
 * VAPID_SUBJECT is accepted as a bare email or as an already-prefixed
 * mailto:/https: value. Blindly prepending "mailto:" produced "mailto:undefined"
 * when the variable was unset, which web-push rejects — and because the caller
 * swallowed everything, that looked identical to a successful send.
 */
function vapidDetails(): { subject: string; publicKey: string; privateKey: string } | null {
  const rawSubject = Deno.env.get('VAPID_SUBJECT') ?? '';
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';

  const missing = [
    rawSubject ? null : 'VAPID_SUBJECT',
    publicKey ? null : 'VAPID_PUBLIC_KEY',
    privateKey ? null : 'VAPID_PRIVATE_KEY',
  ].filter((name): name is string => name !== null);

  if (missing.length > 0) {
    console.error(`[push] NOT CONFIGURED — missing ${missing.join(', ')}. No notification was sent.`);
    return null;
  }

  const subject = /^(mailto:|https?:)/i.test(rawSubject) ? rawSubject : `mailto:${rawSubject}`;
  return { subject, publicKey, privateKey };
}

/**
 * Best-effort push delivery.
 *
 * Push must never break the operation that triggered it, so this still never
 * throws. But every exit path now logs: a silent failure is indistinguishable
 * from a successful delivery, which is how this could run misconfigured
 * indefinitely while appearing to work.
 */
export async function sendPush(
  supabase: SupabaseLike,
  playerId: string,
  title: string,
  body: string,
  url: string,
): Promise<void> {
  try {
    const { data: row, error } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('player_id', playerId)
      .maybeSingle();

    if (error) {
      console.error(`[push] could not read subscription for player ${playerId}: ${error.message}`);
      return;
    }
    if (!row?.subscription) {
      console.info(`[push] player ${playerId} has no push subscription — skipped.`);
      return;
    }

    const vapid = vapidDetails();
    if (!vapid) return;

    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    await webpush.sendNotification(row.subscription, JSON.stringify({ title, body, url }));
    console.info(`[push] delivered to player ${playerId}: ${title}`);
  } catch (e) {
    const err = e as { statusCode?: number; body?: string; message?: string };

    // 404/410 mean the browser has discarded this subscription. Retaining it
    // guarantees a failure on every future send, so drop it.
    if (err.statusCode === 404 || err.statusCode === 410) {
      console.warn(`[push] subscription for player ${playerId} is gone (${err.statusCode}) — removing it.`);
      const { error: deleteError } = await supabase.from('push_subscriptions').delete().eq('player_id', playerId);
      if (deleteError) console.error(`[push] failed to remove dead subscription for ${playerId}: ${deleteError.message}`);
      return;
    }

    console.error(
      `[push] delivery failed for player ${playerId} (status ${err.statusCode ?? 'none'}): ${err.body ?? err.message ?? String(e)}`,
    );
  }
}
