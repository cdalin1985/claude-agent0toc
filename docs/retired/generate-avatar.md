# Retired: `generate-avatar`

Deleted from production (`ankvjywsnydpkepdvuvm`) on 2026-08-13 via
`.github/workflows/retire-edge-function.yml`.

Kept here as a record, deliberately **not** under `supabase/functions/` — a
directory there is either deployed by `deploy-edge-functions.yml` or reported as
an unlisted skip, and this should be neither.

## What it was

An unfinished experiment. Deployed 2026-01-03 as version 4 and never touched
again. It appears in no commit in this repository, is called from nowhere in
`src/`, and no `avatars` object in storage was ever produced by it.

## Why it had to go

`verify_jwt: false` **and no auth check in the handler.** Every other function
in the project either has the gateway check on, or turns it off and
authenticates internally (`create-challenge` reads the caller and returns 401
itself). This one did neither: the first statement in the handler is
`await req.json()`.

That was confirmed against the live function rather than inferred — an
unauthenticated POST came back **HTTP 500 from the JSON parse**, not 401. The
request had reached the body. So anyone who knew the URL could:

- bill an arbitrary number of Gemini Imagen calls to the project's key, and
- write arbitrary PNGs into the public `avatars` bucket, at
  `avatar-<timestamp>.png` with `upsert: true`.

Two smaller things, for completeness: the endpoint it calls
(`imagen-3:generateImages`) is not a real Gemini route, and it reads
`predictions[0].bytesBase64` where the API returns `bytesBase64Encoded`. It
could not have succeeded even when authorised. The exposure was the cost of
running it, not the feature.

## If avatar generation is ever wanted again

Start from scratch, not from this. The shape a replacement needs:

- `verify_jwt: true`, or an internal `supabase.auth.getUser()` returning 401.
- A per-player rate limit. A paid upstream call behind a public URL needs a
  ceiling even when authenticated.
- A deterministic object path (`avatars/<player_id>.png`), not
  `avatar-${Date.now()}.png` with `upsert: true`, which lets one caller fill the
  bucket.
- Source committed here and listed in `deploy-edge-functions.yml`, so it is
  reviewable and so the drift check can see it.

## Recovered source

Pulled from the deployed bundle before deletion.

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { prompt } = await req.json()
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

    // Professional Augmentation: Enhancing the user's prompt for high-fidelity results
    const enhancedPrompt = `High-end professional avatar, ${prompt}, cinematic lighting, neon green and dark grey color palette, sharp focus, digital art masterpiece, 8k resolution, sports profile style.`;

    // 1. Call Gemini Imagen 3 API
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-3:generateImages?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt: enhancedPrompt }],
        parameters: { sampleCount: 1 }
      })
    })

    const result = await response.json()
    if (!response.ok) throw new Error(result.error?.message || 'Failed to generate image')

    const base64Image = result.predictions[0].bytesBase64

    // 2. Upload to Supabase Storage
    const fileName = `avatar-${Date.now()}.png`
    const { data, error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, decodeBase64(base64Image), {
        contentType: 'image/png',
        upsert: true
      })

    if (uploadError) throw uploadError

    // 3. Get Public URL
    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName)

    return new Response(JSON.stringify({ url: publicUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
```
