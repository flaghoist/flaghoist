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

await sharp(Buffer.from(icon(512))).png().toFile(out('icon.png'))
await sharp(Buffer.from(icon(1024))).png().toFile(out('icon-1024.png'))
await sharp(Buffer.from(avatar(512, '#F7F4EC'))).png().toFile(out('avatar.png'))
await sharp(Buffer.from(avatar(512, '#0B1E3A'))).png().toFile(out('avatar-navy.png'))

console.log('Wrote: brand/icon.png (512, transparent), brand/icon-1024.png,')
console.log('       brand/avatar.png (512, sail), brand/avatar-navy.png (512, navy)')
