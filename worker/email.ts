export interface ResendEnv {
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
}

export interface EmailAttachment {
  filename: string;
  contentType?: string;
  bytes: ArrayBuffer;
}

export interface SendEmailInput {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
  idempotencyKey: string;
}

function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function emailBody(message: string, callToAction?: { label: string; url: string }): string {
  const paragraphs = message
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`)
    .join('');

  const button = callToAction
    ? `<p style="margin:24px 0"><a href="${escapeHtml(callToAction.url)}" style="display:inline-block;background:#0a2540;color:white;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">${escapeHtml(callToAction.label)}</a></p>`
    : '';

  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1f2937;background:#f8fafc;margin:0;padding:24px"><div style="max-width:640px;margin:auto;background:white;border:1px solid #e5e7eb;border-radius:12px;padding:28px"><div style="font-size:18px;font-weight:800;color:#0a2540;margin-bottom:20px">ProInspect</div>${paragraphs}${button}<p style="margin:28px 0 0;font-size:12px;color:#64748b">Sent securely by ProInspect.</p></div></body></html>`;
}

export async function sendResendEmail(env: ResendEnv, input: SendEmailInput): Promise<{ id: string }> {
  if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured.');
  if (!env.RESEND_FROM_EMAIL) throw new Error('RESEND_FROM_EMAIL is not configured.');

  const attachments = (input.attachments || []).map((attachment) => ({
    filename: attachment.filename,
    content: bytesToBase64(attachment.bytes),
    content_type: attachment.contentType || 'application/octet-stream',
  }));

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': input.idempotencyKey.slice(0, 256),
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: input.to,
      cc: input.cc?.length ? input.cc : undefined,
      subject: input.subject,
      html: input.html,
      attachments: attachments.length ? attachments : undefined,
    }),
  });

  const payload = await response.json().catch(() => ({})) as { id?: string; message?: string; error?: { message?: string } };
  if (!response.ok || !payload.id) {
    throw new Error(payload.error?.message || payload.message || `Resend rejected the email (${response.status}).`);
  }
  return { id: payload.id };
}
