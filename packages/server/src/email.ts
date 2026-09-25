/**
 * Optional email for invites and password reset links. Flaghoist ships no email provider: you
 * pass a small object that sends a message however you like (Resend, Postmark, Amazon SES,
 * Cloudflare Email, your own SMTP relay behind an HTTP API). Without one, the dashboard and CLI
 * show the link for you to pass on yourself, as before.
 */
export interface EmailMessage {
  to: string
  subject: string
  text: string
  html: string
}

export interface EmailSender {
  /** Send one message. Throw on failure; Flaghoist logs it and still returns the link. */
  send(message: EmailMessage): Promise<void>
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatDate(iso: string): string {
  return new Date(iso).toUTCString().replace(/:\d\d GMT$/, ' UTC')
}

function htmlBody(paragraphs: string[], link: string, button: string): string {
  const safeLink = escapeHtml(link)
  return [
    '<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#0b1e3a">',
    ...paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`),
    `<p><a href="${safeLink}" style="display:inline-block;padding:10px 16px;background:#d9532b;color:#fff;border-radius:6px;text-decoration:none">${escapeHtml(button)}</a></p>`,
    `<p style="font-size:13px;color:#4a5a73">Or open this link: ${safeLink}</p>`,
    '</body></html>',
  ].join('')
}

export function inviteEmail(input: {
  to: string
  role: string
  invitedBy: string
  link: string
  expiresAt: string
  /** Set when the server signs in with SSO only: there is no password to choose. */
  ssoLabel?: string
}): EmailMessage {
  const paragraphs = [
    `${input.invitedBy} invited you to Flaghoist as ${input.role}.`,
    input.ssoLabel
      ? `Open Flaghoist and choose Continue with ${input.ssoLabel}, signing in as ${input.to}. The invite lasts until ${formatDate(input.expiresAt)}.`
      : `Open the link to choose a password and sign in. It works once, until ${formatDate(input.expiresAt)}.`,
    'If you were not expecting this, you can ignore this email; nothing happens until the link is used.',
  ]
  return {
    to: input.to,
    subject: 'You are invited to Flaghoist',
    text: [...paragraphs, '', input.link].join('\n\n'),
    html: htmlBody(paragraphs, input.link, 'Accept the invite'),
  }
}

export function resetEmail(input: { to: string; link: string; expiresAt: string }): EmailMessage {
  const paragraphs = [
    'An admin created a link for you to set a new Flaghoist password.',
    `It works once, until ${formatDate(input.expiresAt)}. Setting a new password signs you out everywhere else.`,
    'If you did not ask for this, tell your Flaghoist admin; your current password keeps working until the link is used.',
  ]
  return {
    to: input.to,
    subject: 'Set a new Flaghoist password',
    text: [...paragraphs, '', input.link].join('\n\n'),
    html: htmlBody(paragraphs, input.link, 'Set a new password'),
  }
}
