// A stand-in for yt-dlp used by the tests. Behaviour is chosen with environment variables:
//   FAKE_YTDLP_INFO    path of a JSON file returned by --dump-single-json
//   FAKE_YTDLP_SUBS    path of a .vtt file written when subtitles are requested
//   FAKE_YTDLP_VIDEO   path of a small video copied when a video is requested
//   FAKE_YTDLP_FAIL    "login" | "gone": exit with that kind of error
//   FAKE_YTDLP_LOG     file where every invocation is appended
import fs from 'node:fs';

const args = process.argv.slice(2);
if (process.env.FAKE_YTDLP_LOG) fs.appendFileSync(process.env.FAKE_YTDLP_LOG, `${JSON.stringify(args)}\n`);
if (args.includes('--version')) { console.log('2099.01.01-test'); process.exit(0); }
if (process.env.FAKE_YTDLP_FAIL === 'login') { console.error('ERROR: [Instagram] abc: Requested content is not available, rate-limit reached or login required. Use --cookies-from-browser or --cookies'); process.exit(1); }
if (process.env.FAKE_YTDLP_FAIL === 'gone') { console.error('ERROR: Video unavailable'); process.exit(1); }
const out = args[args.indexOf('-o') + 1];
if (args.includes('--dump-single-json')) { console.log(fs.readFileSync(process.env.FAKE_YTDLP_INFO, 'utf8')); process.exit(0); }
if (args.includes('--write-subs')) {
  if (process.env.FAKE_YTDLP_SUBS) fs.copyFileSync(process.env.FAKE_YTDLP_SUBS, out.replace('%(ext)s', 'es.vtt'));
  process.exit(0);
}
if (args.includes('bestaudio/best')) { fs.writeFileSync(out.replace('%(ext)s', 'm4a'), Buffer.alloc(4096, 1)); process.exit(0); }
if (args.some((a) => a.startsWith('worst'))) {
  if (!process.env.FAKE_YTDLP_VIDEO) { console.error('ERROR: no video'); process.exit(1); }
  fs.copyFileSync(process.env.FAKE_YTDLP_VIDEO, out.replace('%(ext)s', 'mp4'));
  process.exit(0);
}
console.error('ERROR: unsupported arguments');
process.exit(1);
