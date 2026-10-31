'use strict';
// The Terms of Use and the Privacy Policy. One source for the public pages (/terms and /privacy, which the Google Play
// listing links to) and for the windows inside the app. The wording follows what the game really does; if the game
// changes (accounts, ads, analytics), change this file and bump VERSION so everyone is asked to agree again.
// Set OPERATOR_NAME and CONTACT_EMAIL in the hosting settings so the pages name who runs the game and how to reach them.
const VERSION = '2026-10-31';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function who() {
  const name = (process.env.OPERATOR_NAME || '').trim(), mail = (process.env.CONTACT_EMAIL || '').trim();
  return {
    name: name ? esc(name) : 'the developer of Hexlands',
    contact: mail ? `<a href="mailto:${esc(mail)}">${esc(mail)}</a>` : 'the contact email shown on the Hexlands page on Google Play',
  };
}

function terms() {
  const w = who();
  return `<h2>Terms of Use</h2>
<p class="upd">Version ${VERSION}</p>
<p>Hexlands is a free multiplayer board game that you play in your browser or in the Android app. It is run by ${w.name}. By playing you agree to these terms. If you do not agree, please do not play.</p>
<h3>1. Who can play</h3>
<p>You must be at least 13 years old, or older if the law where you live requires it. If you are under 18, play only with the permission of a parent or guardian.</p>
<h3>2. Your name and your messages</h3>
<p>Your display name and your chat messages are visible to everyone in your room. Keep them friendly. You must not use Hexlands to:</p>
<ul>
<li>harass, bully, threaten or discriminate against anyone, or use hateful language;</li>
<li>post sexual, violent or otherwise offensive content;</li>
<li>share personal information about yourself or anyone else, or ask other players for theirs;</li>
<li>pretend to be someone else, advertise, or send spam;</li>
<li>cheat, exploit bugs, or use automation or attacks that harm the game or other players.</li>
</ul>
<h3>3. Reporting and muting</h3>
<p>You can report any chat message from another player, and mute that player, from the menu next to the message. Muting hides their messages from you. We review reports, and we may remove rooms, block access, or stop the service for anyone who breaks these terms.</p>
<h3>4. Rooms are temporary</h3>
<p>Games are not saved. A room ends when everyone has left, after a period without activity, or when the server restarts, and its game and chat are then deleted. We do not promise that Hexlands will always be available or free of errors.</p>
<h3>5. An independent game</h3>
<p>Hexlands is an independent game. It is not affiliated with, sponsored by or endorsed by any other board game, video game, publisher or brand. All other names and trademarks belong to their owners.</p>
<h3>6. Ownership</h3>
<p>The game, its code, artwork and text belong to ${w.name}. You may play it for yourself. You may not copy or resell it, or scrape or overload our servers.</p>
<h3>7. No warranty, and limits on liability</h3>
<p>Hexlands is provided as it is, without promises. As far as the law allows, we are not responsible for losses that come from using it. Nothing in these terms takes away rights you have under the law that cannot be taken away.</p>
<h3>8. Changes</h3>
<p>We may update these terms and the game. When the terms change in an important way, the game asks you to agree again. We may also change or end the service at any time.</p>
<h3>9. Contact</h3>
<p>Questions or concerns about these terms: ${w.contact}.</p>`;
}

function privacy() {
  const w = who();
  return `<h2>Privacy Policy</h2>
<p class="upd">Version ${VERSION}</p>
<p class="note">In short: there are no accounts, no ads and no tracking. The game keeps only what it needs to run, and rooms disappear when they end.</p>
<p>This policy explains what Hexlands (run by ${w.name}) handles when you play.</p>
<h3>What we handle</h3>
<ul>
<li><b>Your display name</b>, which you type in. Everyone in your room can see it.</li>
<li><b>Your chat messages</b> and the moves you make in the game. Everyone in your room can see them.</li>
<li><b>A random session code</b>, stored on your device, that lets you rejoin your game after a break.</li>
<li><b>Reports</b> you send: the message, the names of you and the reported player, your reason and optional note, the room code and the time.</li>
<li><b>Technical data</b>: when your device connects, our hosting provider processes your IP address and basic request information, as every website does, and may keep it in its own server logs for a limited time.</li>
</ul>
<h3>What we do not collect</h3>
<p>No email address, phone number, location, contacts, photos, camera or microphone data, advertising ID or payment details. There are no analytics, no ads and no tracking cookies.</p>
<h3>What is stored on your device</h3>
<p>The game saves in your browser or app storage: your display name, the session code, your sound settings, the names of players you muted, and your agreement to our terms. The app also keeps a copy of its own files so it starts quickly. You can remove all of this by clearing the site or app data.</p>
<h3>How we use it</h3>
<p>To run the game, to show your name and messages to the other players in your room, and to review reports and keep the game safe. We do not sell your data and do not use it for advertising.</p>
<h3>Who can see it</h3>
<p>The other players in your room see your name and messages. Our hosting provider processes technical data on our behalf. We share information with others only if the law requires it or to protect people from harm.</p>
<h3>How long we keep it</h3>
<p>Game rooms and chat exist only in the server's memory. They are deleted when the room ends: after 30 minutes without activity, after at most 6 hours, or when the server restarts. Reports are kept only as long as needed to review them, and not longer than 90 days where we control the retention (our hosting provider's logs follow its own schedule).</p>
<h3>Your choices</h3>
<p>You can leave a room at any time, mute players, and clear your stored data. Depending on where you live you may have rights to ask what we hold about you, or to have it corrected or deleted. Because there are no accounts, we can find data only by room code and time, so please include them. Write to ${w.contact}.</p>
<h3>Children</h3>
<p>Hexlands is not meant for children under 13, and we do not knowingly collect data from them. If you think a child has used it, contact us and we will delete what we can.</p>
<h3>Security and location</h3>
<p>Connections to the game use HTTPS. The server is run by a cloud hosting provider, so data may be processed in a country other than yours.</p>
<h3>Changes</h3>
<p>If this policy changes in an important way, the version date above changes and the game asks you to agree again.</p>
<h3>Contact</h3>
<p>${w.contact}</p>`;
}

function page(title, body, otherHref, otherLabel) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark">
<title>${esc(title)} · Hexlands</title><style>
:root{color-scheme:light dark;--bg:#fff;--fg:#1c2733;--mut:#5a6b7c;--card:#eef5fb;--acc:#0b5fb0}
@media (prefers-color-scheme:dark){:root{--bg:#0b2037;--fg:#e6eef7;--mut:#9db3c9;--card:#12304d;--acc:#7fc0ff}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:46rem;margin:0 auto;padding:1.2rem 1.1rem 3rem}
nav{display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:.6rem}a{color:var(--acc)}
h2{font-size:1.7rem;margin:.4rem 0}h3{font-size:1.1rem;margin:1.5rem 0 .2rem}p,li{margin:.4rem 0}.upd{color:var(--mut);font-size:.9rem}
.note{background:var(--card);padding:.7rem .9rem;border-radius:10px}
</style></head><body><main><nav><a href="/">← Back to Hexlands</a><a href="${esc(otherHref)}">${esc(otherLabel)}</a></nav>${body}</main></body></html>`;
}

module.exports = {
  VERSION, terms, privacy,
  bundle: () => ({ version: VERSION, terms: terms(), privacy: privacy() }),
  termsPage: () => page('Terms of Use', terms(), '/privacy', 'Privacy Policy'),
  privacyPage: () => page('Privacy Policy', privacy(), '/terms', 'Terms of Use'),
};
