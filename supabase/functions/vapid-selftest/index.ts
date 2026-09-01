import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Prove the VAPID key pair matches, without sending anything to anybody.
//
// A mismatched pair is the one push failure with no symptom until it matters:
// subscribing succeeds, the whole cron chain reports success, and delivery only
// fails when a real reminder is due -- as a 403 nobody is watching for. Every
// other link (pg_cron, pg_net, auth, the function's own logic) is checkable from
// a SQL prompt. This one was not, because sendPush looks for a subscription
// before it ever touches the keys, so with nobody subscribed the VAPID branch is
// unreachable.
//
// The check is arithmetic, not delivery. An ECDSA P-256 private scalar either
// corresponds to a public point or it does not: build a JWK from the public
// key's x/y plus the private d, sign a message with it, and verify that
// signature against the public key alone. A non-matching d either fails import
// or produces a signature the public key rejects. No push service is contacted
// and no subscription is required.
//
// Reports booleans only. The private key is never returned, logged, or echoed.
// The public key is public by construction -- it ships in the browser bundle.

function b64urlToBytes(value: string): Uint8Array {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function bytesToB64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function isServiceRoleJwt(token: string): boolean {
  try {
    const payload = token.split('.')[1];
    if (!payload) return false;
    const json = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=')),
    );
    return json?.role === 'service_role' && json?.iss === 'supabase';
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // service_role (the operator running a check) or an admin session.
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    let authorised = !!token && isServiceRoleJwt(token);
    if (!authorised && token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        authorised = !!profile && ['admin', 'super_admin'].includes(profile.role);
      }
    }
    if (!authorised) return json({ error: 'Unauthorized' }, 401);

    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
    const subject = Deno.env.get('VAPID_SUBJECT') ?? '';

    const missing = [
      subject ? null : 'VAPID_SUBJECT',
      publicKey ? null : 'VAPID_PUBLIC_KEY',
      privateKey ? null : 'VAPID_PRIVATE_KEY',
    ].filter((n): n is string => n !== null);

    if (missing.length > 0) {
      return json({ configured: false, missing, paired: false, detail: 'Push is not configured on the server.' });
    }

    // An uncompressed P-256 point: 0x04 || x(32) || y(32).
    const pub = b64urlToBytes(publicKey);
    if (pub.length !== 65 || pub[0] !== 0x04) {
      return json({
        configured: true, paired: false,
        detail: `VAPID_PUBLIC_KEY is not an uncompressed P-256 point (${pub.length} bytes). It should be 65 bytes and start with 0x04.`,
      });
    }

    const x = bytesToB64url(pub.slice(1, 33));
    const y = bytesToB64url(pub.slice(33, 65));
    const d = privateKey.replace(/-/g, '-').replace(/_/g, '_').replace(/=+$/, '');

    const alg = { name: 'ECDSA', namedCurve: 'P-256' } as const;
    let paired = false;
    let detail = '';

    try {
      // If d does not belong to (x, y), a conforming implementation rejects
      // this import outright.
      const priv = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x, y, d, ext: true }, alg, false, ['sign']);
      const pubKey = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x, y, ext: true }, alg, false, ['verify']);

      // Belt and braces: some implementations import without checking, so make
      // the pair actually do the work it exists to do.
      const message = new TextEncoder().encode('toc-vapid-selftest');
      const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, message);
      paired = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pubKey, signature, message);
      detail = paired
        ? 'The VAPID private key matches the public key browsers subscribe with. Delivery will not fail for key reasons.'
        : 'The private key imported but produced a signature the public key rejects. They are not a pair.';
    } catch (e) {
      paired = false;
      // The message can name the curve or key length; it cannot contain the key.
      detail = `The VAPID key pair is invalid: ${e instanceof Error ? e.message : String(e)}. Regenerate with "npx web-push generate-vapid-keys" and set both halves.`;
    }

    return json({
      configured: true,
      paired,
      public_key_matches_bundle_shape: true,
      detail,
    });
  } catch (e) {
    console.error(`[vapid-selftest] unhandled: ${e instanceof Error ? e.message : String(e)}`);
    return json({ error: 'Something went wrong on our end. Please try again.' }, 500);
  }
});
