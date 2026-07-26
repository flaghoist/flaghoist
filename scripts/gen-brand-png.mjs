// Rasterize the Flaghoist mark (brand/icon.svg) to PNGs for avatars, social, and favicons.
// Run: node scripts/gen-brand-png.mjs
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const out = (p) => fileURLToPath(new URL(`../brand/${p}`, import.meta.url))

// The mark, verbatim from brand/icon.svg (navy halyard + orange swallowtail flag).
const MARK = `
  <circle cx="16" cy="9" r="3" fill="#0B1E3A"/>
  <line x1="16" y1="9" x2="16" y2="57" stroke="#0B1E3A" stroke-width="3.5" stroke-linecap="round"/>
  <path d="M16 13 L52 15.5 L40.5 24 L52 32.5 L16 31 Z" fill="#FF4A1F"/>
  <path d="M16 31 L40.5 24 L52 32.5 L16 31 Z" fill="#0B1E3A" fill-opacity="0.14"/>
`

// Transparent mark, drawn crisply at the target pixel size.
const icon = (size) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">${MARK}</svg>`

// Filled avatar: the 64-unit mark centred in an 80-unit square (→ padding) on a background.
const avatar = (size, bg) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">` +
  `<rect width="80" height="80" fill="${bg}"/><g transform="translate(8,8)">${MARK}</g></svg>`

// Social share card, 1200x630 — what renders when flaghoist.dev is posted to HN, X, or Slack.
// Kept in sync with the landing-page hero copy.
const og = () => `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0B1E3A"/>
  <g fill="#F7F4EC" fill-opacity="0.05">
    ${Array.from({ length: 13 }, (_, i) => `<rect x="${i * 96}" y="0" width="1" height="630"/>`).join('')}
    ${Array.from({ length: 7 }, (_, i) => `<rect x="0" y="${i * 96}" width="1200" height="1"/>`).join('')}
  </g>
  <!--
    Lockup. The mark's own left edge is at x=13 in its 64-unit box, so translate by
    (96 - 13*scale) to optically align it with the 96px text margin below. The wordmark
    is deliberately smaller than the headline — on a share card the message leads, not
    the brand — and its baseline is set to the mark's vertical centre.
  -->
  <g transform="translate(79,96) scale(1.3)">
    <circle cx="16" cy="9" r="3" fill="#F7F4EC"/>
    <line x1="16" y1="9" x2="16" y2="57" stroke="#F7F4EC" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M16 13 L52 15.5 L40.5 24 L52 32.5 L16 31 Z" fill="#FF4A1F"/>
    <path d="M16 31 L40.5 24 L52 32.5 L16 31 Z" fill="#000" fill-opacity="0.16"/>
  </g>
  <text x="169" y="155" font-family="Georgia, serif" font-size="52" font-weight="600" fill="#F7F4EC">Flaghoist</text>
  <text x="96" y="330" font-family="Georgia, serif" font-size="68" font-weight="600" fill="#F7F4EC">Feature flags at <tspan fill="#FF4A1F">the edge.</tspan></text>
  <text x="96" y="402" font-family="Helvetica, Arial, sans-serif" font-size="29" fill="#B9C2D0">No server. No database. No bill.</text>
  <text x="96" y="448" font-family="Helvetica, Arial, sans-serif" font-size="29" fill="#B9C2D0">Self-hosted, OpenFeature-native, Apache-2.0.</text>
  <rect x="96" y="512" width="180" height="4" fill="#FF4A1F"/>
  <text x="96" y="558" font-family="Courier New, monospace" font-size="24" fill="#8494A8">flaghoist.dev</text>
</svg>`

await sharp(Buffer.from(icon(512)))
  .png()
  .toFile(out('icon.png'))
await sharp(Buffer.from(icon(1024)))
  .png()
  .toFile(out('icon-1024.png'))
await sharp(Buffer.from(avatar(512, '#F7F4EC')))
  .png()
  .toFile(out('avatar.png'))
await sharp(Buffer.from(avatar(512, '#0B1E3A')))
  .png()
  .toFile(out('avatar-navy.png'))
await sharp(Buffer.from(og())).png().toFile(out('og.png'))
// The landing page serves it from /og.png.
await sharp(Buffer.from(og()))
  .png()
  .toFile(fileURLToPath(new URL('../apps/web/public/og.png', import.meta.url)))

console.log('Wrote: brand/icon.png (512, transparent), brand/icon-1024.png,')
console.log('       brand/avatar.png (512, sail), brand/avatar-navy.png (512, navy),')
console.log('       brand/og.png + apps/web/public/og.png (1200x630 social card)')
