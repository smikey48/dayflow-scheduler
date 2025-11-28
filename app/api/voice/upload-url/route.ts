import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedUserId } from '@/lib/auth'

// --- CONFIG ---
// Uses service role on the server to mint signed upload URLs.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const VOICE_BUCKET = process.env.VOICE_BUCKET || 'voice'

// very small helper to map content-type to extension if filename has none
function inferExt(filename?: string, contentType?: string): string {
  if (filename && filename.includes('.')) {
    return '.' + filename.split('.').pop()!.toLowerCase()
  }
  const ct = (contentType || '').toLowerCase()
  if (ct.includes('wav')) return '.wav'
  if (ct.includes('mpeg') || ct.includes('mp3')) return '.mp3'
  if (ct.includes('m4a')) return '.m4a'
  if (ct.includes('ogg')) return '.ogg'
  if (ct.includes('webm')) return '.webm'
  if (ct.includes('mp4')) return '.mp4'
  if (ct.includes('flac')) return '.flac'
  // fallback (Whisper supports these common ones; choose one)
  return '.wav'
}

export async function POST(req: Request) {
  try {
    // Get authenticated user
    const user_id = await getAuthenticatedUserId(req as any);
    
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })

    const body = await req.json().catch(() => ({}))
    const filename: string | undefined = body?.filename
    const contentType: string | undefined = body?.contentType

    // Create a new job id (server-authoritative)
    const job_id = crypto.randomUUID()

    // Build a clean, bucket-relative storage path (❌ DO NOT include "voice/")
    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    const dateFolder = `${yyyy}-${mm}-${dd}`

    const ext = inferExt(filename, contentType)
    const objectName = `${job_id}${ext}`
    const storage_path = `${user_id}/${dateFolder}/${objectName}`

    // Create a signed upload URL (client will PUT the binary to this URL with the token)
    // ✅ new (valid arity: path + expiresInSeconds)
    const { data: signed, error: signedErr } = await supabase
    .storage
    .from(VOICE_BUCKET)
    .createSignedUploadUrl(storage_path, { upsert: true }); // ✅ correct



    if (signedErr || !signed) {
      return NextResponse.json({ error: 'Failed to create signed upload URL', details: signedErr?.message }, { status: 500 })
    }

    // Insert a job row now (you can also set status='created' and mark queued later)
    const { error: insertErr } = await supabase.from('voice_jobs').insert({
      job_id,
      user_id,
      status: 'queued',           // or 'created' if you want to queue after verifying object exists
      storage_path,               // NOTE: bucket-relative path (no "voice/" prefix)
      content_type: contentType || null,
      size_bytes: null,           // will be filled by worker or /jobs POST if you record it there
      queued_at: new Date().toISOString(),
    })

    if (insertErr) {
      return NextResponse.json({ error: 'Failed to insert voice job', details: insertErr.message }, { status: 500 })
    }

    // Return everything the client needs to upload
    return NextResponse.json({
      job_id,
      storage_path,       // bucket-relative (e.g., "USER/2025-10-17/<job>.wav")
      signedUrl: signed.signedUrl,
      token: signed.token, // pass this into supabase-js uploadToSignedUrl OR do a raw fetch PUT with header
    })
  } catch (e: any) {
    const status = e?.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status })
  }
}
