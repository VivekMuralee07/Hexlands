// Hexlands SVG art. All illustrations are hand-built vector shapes, injected once as a sprite.
(function () {
  const HEX = '0,-60 52,-30 52,30 0,60 -52,30 -52,-30';
  const grad = (id, a, b, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  const rgrad = (id, a, b) => `<radialGradient id="${id}" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>`;

  const pine = `<g id="pine">
    <ellipse cx="2" cy="16" rx="11" ry="3" fill="#0d2a16" opacity=".45"/>
    <rect x="-2" y="6" width="4" height="10" rx="1" fill="#5b3a1f"/>
    <path d="M0,-24 L11,-8 L-11,-8Z" fill="#2f7d3f"/><path d="M0,-24 L-11,-8 L0,-8Z" fill="#46a05a"/>
    <path d="M0,-15 L14,2 L-14,2Z" fill="#27703a"/><path d="M0,-15 L-14,2 L0,2Z" fill="#3c9150"/>
    <path d="M0,-6 L16,10 L-16,10Z" fill="#1f6131"/><path d="M0,-6 L-16,10 L0,10Z" fill="#348546"/>
  </g>`;
  const oak = `<g id="oak">
    <ellipse cx="2" cy="15" rx="10" ry="3" fill="#0d2a16" opacity=".45"/>
    <rect x="-2" y="2" width="4" height="13" fill="#6b4524"/>
    <circle cx="-6" cy="-2" r="8" fill="#2d7a3a"/><circle cx="6" cy="-3" r="8" fill="#24692f"/>
    <circle cx="0" cy="-10" r="9" fill="#3a9149"/><circle cx="-3" cy="-12" r="3.5" fill="#5bb066" opacity=".8"/>
  </g>`;
  const bricks = `<g id="bricks">
    <ellipse cx="0" cy="11" rx="16" ry="3.5" fill="#4a1d0c" opacity=".4"/>
    ${[[-14, 3], [-4, 3], [6, 3], [-9, -3], [1, -3], [-4, -9]].map(([x, y]) =>
      `<rect x="${x}" y="${y}" width="10" height="6" rx="1" fill="#c4542c" stroke="#6e2611" stroke-width=".9"/><rect x="${x + 1}" y="${y + 1}" width="8" height="1.4" fill="#e17b4f" opacity=".7"/>`).join('')}
  </g>`;
  const sheep = `<g id="sheep">
    <ellipse cx="1" cy="9" rx="12" ry="2.5" fill="#24481a" opacity=".4"/>
    <path d="M-6,4 v6 M-2,5 v6 M4,5 v6 M8,4 v6" stroke="#2b2622" stroke-width="2" stroke-linecap="round"/>
    <g fill="#f7f4ec" stroke="#cfc8b8" stroke-width=".8">
      <circle cx="-5" cy="-1" r="5.5"/><circle cx="1" cy="-3" r="6"/><circle cx="7" cy="-1" r="5.5"/>
      <circle cx="-2" cy="3" r="5.5"/><circle cx="5" cy="3" r="5.5"/>
    </g>
    <ellipse cx="-11" cy="-1" rx="3.6" ry="4.6" fill="#2f2a26"/>
    <ellipse cx="-13.6" cy="-3" rx="2" ry="1" fill="#2f2a26" transform="rotate(-25 -13.6 -3)"/>
    <circle cx="-11.8" cy="-2" r=".8" fill="#fff"/>
  </g>`;
  const tuft = `<path id="tuft" d="M-4,0 L-2,-6 L-1,0 M0,0 L1,-8 L2,0 M3,0 L5,-5 L5.5,0" stroke="#3f7d2a" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
  const wheat = `<g id="wheat">
    <path d="M0,14 Q1,0 0,-14" stroke="#a87a22" stroke-width="1.2" fill="none"/>
    ${[-12, -8, -4, 0, 4].map((y, i) => `<ellipse cx="${i % 2 ? 2.2 : -2.2}" cy="${y}" rx="2" ry="3.4" fill="#f4d675" stroke="#b98a28" stroke-width=".6" transform="rotate(${i % 2 ? 25 : -25} ${i % 2 ? 2.2 : -2.2} ${y})"/>`).join('')}
    <path d="M0,-14 l-1,-5 M0,-14 l1.5,-5" stroke="#c9a040" stroke-width=".6"/>
  </g>`;
  const cactus = `<g id="cactus">
    <ellipse cx="1" cy="16" rx="9" ry="2.5" fill="#7a5a26" opacity=".4"/>
    <rect x="-3.5" y="-14" width="7" height="30" rx="3.5" fill="#4d8a46"/>
    <path d="M-3,0 h-5 a3,3 0 0 1 -3,-3 v-7" stroke="#4d8a46" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M3,4 h4 a3,3 0 0 0 3,-3 v-6" stroke="#4d8a46" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M-1,-12 v26" stroke="#6eae64" stroke-width="1.2"/>
  </g>`;
  const ore = `<g id="orechunk">
    <path d="M-9,4 L-5,-6 L3,-9 L9,-2 L7,6 L-3,8Z" fill="#3c4a5e"/>
    <path d="M-5,-6 L3,-9 L1,-1Z" fill="#8fa6c4"/><path d="M3,-9 L9,-2 L1,-1Z" fill="#5d7391"/>
    <path d="M-9,4 L-5,-6 L1,-1 L-3,8Z" fill="#4e5f77"/><path d="M1,-1 L9,-2 L7,6 L-3,8Z" fill="#2c3747"/>
    <circle cx="-2" cy="-5" r="1" fill="#e8f0ff"/>
  </g>`;

  const t = {};
  t.forest = `<rect x="-60" y="-60" width="120" height="120" fill="url(#g-forest)"/>
    <ellipse cx="-20" cy="10" rx="30" ry="14" fill="#1a4524" opacity=".5"/><ellipse cx="25" cy="-15" rx="24" ry="10" fill="#1a4524" opacity=".4"/>
    ${[[-6, -46, .85, 'pine'], [22, -40, .95, 'pine'], [-30, -30, 1, 'pine'], [40, -14, .9, 'oak'], [-42, 0, .95, 'pine'], [34, 16, 1.05, 'pine'], [-30, 26, 1, 'oak'], [4, 40, 1, 'pine'], [-10, 30, .8, 'pine'], [26, 42, .8, 'oak'], [-46, 22, .75, 'pine']]
      .map(([x, y, s, k]) => `<use href="#${k}" transform="translate(${x} ${y}) scale(${s})"/>`).join('')}`;
  t.hills = `<rect x="-60" y="-60" width="120" height="120" fill="url(#g-hills)"/>
    <path d="M-60,-10 Q-30,-40 0,-18 T60,-24 V60 H-60Z" fill="#a85b33"/>
    <path d="M-60,20 Q-25,-6 10,16 T60,10 V60 H-60Z" fill="#934a27"/>
    <path d="M-50,-14 q8,-4 16,0 M18,-20 q8,-3 14,0 M-20,12 q8,-4 16,0 M24,22 q6,-3 12,0" stroke="#d98a5c" stroke-width="1.4" fill="none" opacity=".7"/>
    <ellipse cx="-30" cy="38" rx="12" ry="5" fill="#5a2a13" opacity=".7"/><ellipse cx="-30" cy="37" rx="9" ry="3.4" fill="#7a3a1c"/>
    <use href="#bricks" transform="translate(-28 -32) scale(1.05)"/><use href="#bricks" transform="translate(30 28) scale(1.15)"/>
    <use href="#bricks" transform="translate(32 -30) scale(.8)"/>
    <path d="M10,44 l6,-10 l6,10z" fill="#6e3518"/><rect x="13" y="38" width="6" height="6" fill="#c97a3e"/>`;
  t.pasture = `<rect x="-60" y="-60" width="120" height="120" fill="url(#g-pasture)"/>
    <path d="M-60,-20 Q0,-36 60,-22 M-60,24 Q0,8 60,22" stroke="#9ed06a" stroke-width="10" fill="none" opacity=".35"/>
    ${[[-40, -40], [-14, -50], [10, -30], [40, -40], [-48, 10], [-20, 18], [44, 6], [18, 48], [-34, 44], [0, 52], [36, 32], [-4, -40]].map(([x, y]) => `<use href="#tuft" transform="translate(${x} ${y})"/>`).join('')}
    <circle cx="-40" cy="-20" r="2" fill="#f2e86a"/><circle cx="30" cy="-10" r="1.6" fill="#fff"/><circle cx="-14" cy="44" r="1.8" fill="#f2e86a"/><circle cx="44" cy="26" r="1.6" fill="#fff"/>
    <path d="M14,54 L56,30" stroke="#7a5a33" stroke-width="1.6"/><path d="M14,49 L56,25" stroke="#7a5a33" stroke-width="1.6"/>
    ${[[18, 52], [30, 45], [42, 38], [54, 31]].map(([x, y]) => `<rect x="${x - 1}" y="${y - 9}" width="2.4" height="11" fill="#5b3f22"/>`).join('')}
    <use href="#sheep" transform="translate(-28 -26)"/><use href="#sheep" transform="translate(30 -24) scale(-.9 .9)"/>
    <use href="#sheep" transform="translate(-30 28) scale(1.05)"/><use href="#sheep" transform="translate(-4 -44) scale(.7)"/>`;
  t.fields = `<rect x="-60" y="-60" width="120" height="120" fill="url(#g-fields)"/>
    ${[-48, -36, -24, 24, 36, 48].map(y => `<path d="M-60,${y} Q0,${y - 8} 60,${y}" stroke="#c4952e" stroke-width="2" fill="none" opacity=".55"/>`).join('')}
    ${[[-36, -36], [-26, -40], [-16, -36], [16, -38], [26, -42], [36, -36], [-40, 2], [-32, -2], [36, 0], [44, 4], [-26, 34], [-16, 38], [-6, 42], [14, 36], [24, 40], [34, 34]]
      .map(([x, y], i) => `<use href="#wheat" transform="translate(${x} ${y}) rotate(${(i % 3 - 1) * 6}) scale(.95)"/>`).join('')}
    <g transform="translate(38 -14)"><ellipse cx="0" cy="8" rx="9" ry="2.5" fill="#7a5a1a" opacity=".4"/><path d="M-8,8 Q-8,-8 0,-10 Q8,-8 8,8Z" fill="#e2b84a" stroke="#a5781e" stroke-width=".8"/><path d="M-6,0 h12 M-7,4 h14" stroke="#b88a2a" stroke-width=".7"/></g>`;
  t.mountains = `<rect x="-60" y="-60" width="120" height="120" fill="url(#g-mountains)"/>
    <path d="M-60,30 L-34,-34 L-16,0 L6,-50 L34,4 L48,-20 L60,0 V60 H-60Z" fill="#6c7680"/>
    <path d="M-34,-34 L-48,30 L-22,14Z" fill="#a3acb5"/><path d="M6,-50 L-10,20 L14,8Z" fill="#a9b2bb"/><path d="M48,-20 L38,20 L56,8Z" fill="#9aa3ad"/>
    <path d="M-34,-34 L-41,-17 L-36,-20 L-32,-14 L-27,-20Z" fill="#f4f7fb"/>
    <path d="M6,-50 L-3,-30 L3,-33 L7,-26 L13,-32 L17,-30Z" fill="#f4f7fb"/>
    <path d="M48,-20 L44,-10 L48,-12 L52,-8 L53,-13Z" fill="#eef2f7"/>
    <path d="M-60,40 L-20,22 L20,30 L60,18 V60 H-60Z" fill="#555e68"/>
    <use href="#orechunk" transform="translate(-30 40) scale(1.1)"/><use href="#orechunk" transform="translate(30 38) scale(.9)"/><use href="#orechunk" transform="translate(42 -2) scale(.6)"/>`;
  t.desert = `<rect x="-60" y="-60" width="120" height="120" fill="url(#g-desert)"/>
    <path d="M-60,-24 Q-20,-44 20,-26 T60,-30" stroke="#c99d55" stroke-width="2" fill="none"/><path d="M-60,-6 Q-10,-26 30,-6 T60,-10" stroke="#d8b06a" stroke-width="1.5" fill="none"/>
    <path d="M-60,30 Q-20,10 20,30 T60,24 V60 H-60Z" fill="#d9b26c"/>
    <use href="#cactus" transform="translate(-32 -24) scale(.9)"/><use href="#cactus" transform="translate(34 18) scale(1.1)"/>
    <ellipse cx="26" cy="-34" rx="6" ry="3.5" fill="#a5814a"/><ellipse cx="-30" cy="36" rx="5" ry="3" fill="#a5814a"/>
    <circle cx="40" cy="-42" r="6" fill="#ffe08a" opacity=".5"/>`;

  const symbols = Object.keys(t).map(k => `<symbol id="t-${k}" viewBox="-60 -60 120 120" overflow="visible">${t[k]}</symbol>`).join('');

  const icons = {
    wood: `<g><rect x="4" y="13" width="22" height="7" rx="3.5" fill="#8a5a2b"/><rect x="7" y="20" width="22" height="7" rx="3.5" fill="#7a4d24"/><rect x="5" y="6" width="20" height="7" rx="3.5" fill="#9b6631"/>
      <circle cx="25" cy="16.5" r="3.6" fill="#e3b77a" stroke="#7a4d24"/><circle cx="25" cy="16.5" r="1.4" fill="none" stroke="#a87436" stroke-width=".7"/>
      <circle cx="28" cy="23.5" r="3.6" fill="#e3b77a" stroke="#6b4320"/><circle cx="28" cy="23.5" r="1.4" fill="none" stroke="#a87436" stroke-width=".7"/>
      <circle cx="24" cy="9.5" r="3.6" fill="#e8c086" stroke="#7a4d24"/><circle cx="24" cy="9.5" r="1.4" fill="none" stroke="#a87436" stroke-width=".7"/>
      <path d="M8,7 l2,-3 l1,3" fill="#4f9a4a"/></g>`,
    brick: `<g stroke="#6e2611" stroke-width="1"><rect x="3" y="18" width="12" height="7" rx="1" fill="#c4542c"/><rect x="16" y="18" width="12" height="7" rx="1" fill="#b54a25"/>
      <rect x="9" y="10" width="12" height="7" rx="1" fill="#d0613a"/><rect x="22" y="10" width="7" height="7" rx="1" fill="#c4542c"/><rect x="3" y="10" width="5" height="7" rx="1" fill="#b54a25"/>
      <rect x="10" y="3" width="12" height="6" rx="1" fill="#c4542c"/></g>`,
    sheep: `<g><g fill="#fbf8f0" stroke="#bdb5a4"><circle cx="13" cy="15" r="6"/><circle cx="19" cy="13" r="6"/><circle cx="24" cy="17" r="5"/><circle cx="15" cy="20" r="5.5"/><circle cx="21" cy="21" r="5"/></g>
      <ellipse cx="7.5" cy="15" rx="4" ry="5" fill="#2f2a26"/><circle cx="6.5" cy="14" r=".9" fill="#fff"/><path d="M13,25 v4 M22,25 v4" stroke="#2f2a26" stroke-width="2" stroke-linecap="round"/></g>`,
    wheat: `<g><path d="M16,30 L16,8 M16,30 L9,12 M16,30 L23,12" stroke="#a87a22" stroke-width="1.3"/>
      ${[[16, 6], [16, 11], [16, 16], [9, 10], [10, 15], [23, 10], [22, 15]].map(([x, y], i) => `<ellipse cx="${x + (i % 2 ? 1.5 : -1.5)}" cy="${y}" rx="2" ry="3.2" fill="#f2cf5f" stroke="#b5862a" stroke-width=".6"/>`).join('')}
      <path d="M11,22 h10" stroke="#8a5a1a" stroke-width="2.4"/></g>`,
    ore: `<g><path d="M4,22 L9,9 L19,5 L28,13 L26,24 L14,28Z" fill="#3c4a5e"/><path d="M9,9 L19,5 L16,15Z" fill="#a3b8d6"/><path d="M19,5 L28,13 L16,15Z" fill="#6c84a5"/>
      <path d="M4,22 L9,9 L16,15 L14,28Z" fill="#53647e"/><path d="M16,15 L28,13 L26,24 L14,28Z" fill="#2a3444"/><path d="M12,8 l1.5,3 l3,1.5 l-3,1.5 l-1.5,3 l-1.5,-3 l-3,-1.5 l3,-1.5z" fill="#fff" opacity=".9"/></g>`,
    any: `<g><circle cx="16" cy="16" r="12" fill="#e7c76a" stroke="#8a6a1c" stroke-width="1.4"/><text x="16" y="21" text-anchor="middle" font-size="14" font-weight="700" fill="#5a4310" font-family="Georgia,serif">?</text></g>`,
    knight: `<g><path d="M16,3 L27,8 V16 C27,23 21,28 16,30 C11,28 5,23 5,16 V8Z" fill="#b3bcc7" stroke="#4a5562" stroke-width="1.2"/><path d="M16,3 L27,8 V16 C27,23 21,28 16,30Z" fill="#8a96a5"/>
      <path d="M16,9 v16 M10,15 h12" stroke="#c0392b" stroke-width="3"/></g>`,
    vp: `<g><path d="M6,28 h20 v-12 l-4,3 v-8 l-3,2 l-3,-6 l-3,6 l-3,-2 v8 l-4,-3z" fill="#e3b448" stroke="#7a5512" stroke-width="1.2"/><rect x="13" y="20" width="6" height="8" fill="#7a5512"/></g>`,
    roadBuilding: `<g><path d="M10,30 L14,2 h4 L22,30Z" fill="#7a6a58"/><path d="M16,5 v4 M16,13 v4 M16,21 v5" stroke="#f1e3b0" stroke-width="1.6"/><path d="M3,30 h26" stroke="#4a3d30" stroke-width="2"/></g>`,
    yearOfPlenty: `<g><path d="M28,6 C18,6 8,12 5,26 L12,28 C14,20 20,14 28,13Z" fill="#c98a3a" stroke="#6b4318"/><circle cx="25" cy="8" r="3" fill="#d6402b"/><circle cx="21" cy="6" r="2.4" fill="#f2cf5f"/><circle cx="27" cy="12" r="2.2" fill="#6aa84f"/></g>`,
    monopoly: `<g><path d="M4,24 L6,10 L11,16 L16,6 L21,16 L26,10 L28,24Z" fill="#e3b448" stroke="#7a5512" stroke-width="1.2"/><rect x="4" y="24" width="24" height="4" fill="#c99a2c" stroke="#7a5512"/><circle cx="16" cy="18" r="2" fill="#c0392b"/></g>`,
    road: `<g><rect x="3" y="13" width="26" height="7" rx="2" fill="currentColor" stroke="#1d1d1d" stroke-width="1.2" transform="rotate(-25 16 16)"/></g>`,
    settlement: `<g><path d="M6,28 V15 L16,6 L26,15 V28Z" fill="currentColor" stroke="#1d1d1d" stroke-width="1.4"/><rect x="13" y="20" width="6" height="8" fill="#1d1d1d" opacity=".55"/></g>`,
    city: `<g><path d="M3,29 V17 L10,11 L17,17 V9 L23,4 L29,9 V29Z" fill="currentColor" stroke="#1d1d1d" stroke-width="1.4"/><rect x="21" y="12" width="4" height="4" fill="#1d1d1d" opacity=".5"/><rect x="8" y="22" width="5" height="7" fill="#1d1d1d" opacity=".55"/></g>`,
    dev: `<g><rect x="7" y="3" width="18" height="26" rx="3" fill="#5a3d8a" stroke="#2c1d47" stroke-width="1.2"/><path d="M16,9 l2,5 h5 l-4,3 l1.5,5 l-4.5,-3 l-4.5,3 l1.5,-5 l-4,-3 h5z" fill="#e3c46a"/></g>`,
    cards: `<g><rect x="5" y="6" width="15" height="21" rx="2.5" fill="#d9c387" stroke="#5a4310" stroke-width="1.2" transform="rotate(-12 12 16)"/><rect x="12" y="5" width="15" height="21" rx="2.5" fill="#f0e2b6" stroke="#5a4310" stroke-width="1.2" transform="rotate(8 19 15)"/></g>`,
    bot: `<g><rect x="6" y="9" width="20" height="16" rx="4" fill="#b9c6cf" stroke="#2c3a44" stroke-width="1.4"/><path d="M16,9 V5" stroke="#2c3a44" stroke-width="1.6"/><circle cx="16" cy="4" r="2" fill="#e8a21c"/>
      <circle cx="12" cy="16" r="2.4" fill="#1b2a30"/><circle cx="20" cy="16" r="2.4" fill="#1b2a30"/><circle cx="12.6" cy="15.4" r=".8" fill="#9fe3ff"/><circle cx="20.6" cy="15.4" r=".8" fill="#9fe3ff"/><path d="M12,21 h8" stroke="#1b2a30" stroke-width="1.6" stroke-linecap="round"/><rect x="3" y="14" width="3" height="6" rx="1" fill="#8a99a4"/><rect x="26" y="14" width="3" height="6" rx="1" fill="#8a99a4"/></g>`,
    sound: `<g fill="currentColor"><path d="M5,12 h5 l7,-6 v20 l-7,-6 h-5z"/><path d="M21,11 q3,5 0,10 M24,8 q6,8 0,16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></g>`,
    soundoff: `<g fill="currentColor"><path d="M5,12 h5 l7,-6 v20 l-7,-6 h-5z"/><path d="M21,12 l7,8 M28,12 l-7,8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></g>`,
    music: `<g fill="currentColor"><path d="M12,24 V8 l14,-3 v16" stroke="currentColor" stroke-width="2.2" fill="none"/><ellipse cx="9" cy="24" rx="4" ry="3"/><ellipse cx="23" cy="21" rx="4" ry="3"/></g>`,
    musicoff: `<g fill="currentColor" opacity=".9"><path d="M12,24 V8 l14,-3 v16" stroke="currentColor" stroke-width="2.2" fill="none"/><ellipse cx="9" cy="24" rx="4" ry="3"/><ellipse cx="23" cy="21" rx="4" ry="3"/><path d="M4,4 L28,28" stroke="#e0664f" stroke-width="2.6" stroke-linecap="round"/></g>`,
    trophy: `<g><path d="M9,4 h14 v6 c0,6 -3,10 -7,10 c-4,0 -7,-4 -7,-10z" fill="#e3b448" stroke="#7a5512" stroke-width="1.2"/><path d="M9,7 h-4 c0,5 2,7 5,7 M23,7 h4 c0,5 -2,7 -5,7" stroke="#7a5512" stroke-width="1.6" fill="none"/><rect x="14" y="19" width="4" height="5" fill="#c99a2c"/><rect x="9" y="24" width="14" height="4" rx="1" fill="#8a6a1c"/><path d="M13,8 l1,3 h3 l-2.5,2 l1,3 l-2.5,-2 l-2.5,2 l1,-3 l-2.5,-2 h3z" fill="#fff3c4" transform="translate(2.5 -1)"/></g>`,
    robber: `<g><ellipse cx="16" cy="29" rx="8" ry="2" fill="#000" opacity=".3"/><path d="M8,29 C8,18 11,13 16,13 C21,13 24,18 24,29Z" fill="#3a3a3f"/><circle cx="16" cy="9" r="5.5" fill="#4a4a50"/><path d="M12,9 h8" stroke="#d9d9d9" stroke-width="1"/></g>`,
  };
  const iconSymbols = Object.keys(icons).map(k => `<symbol id="ic-${k}" viewBox="0 0 32 32">${icons[k]}</symbol>`).join('');

  const defs = `<defs>
    ${grad('g-forest', '#3c7d44', '#1c4626')}${grad('g-hills', '#c7774a', '#8a4526')}${grad('g-pasture', '#9fd166', '#5c9a3a')}
    ${grad('g-fields', '#f0cf68', '#c9962b')}${grad('g-mountains', '#9ca5af', '#59626d')}${grad('g-desert', '#f1dca6', '#d2ad68')}
    ${rgrad('g-sea', '#1f6a80', '#0b2d3d')}${rgrad('g-token', '#fffaf0', '#e6d6b0')}${rgrad('g-brass', '#f3d27e', '#a87a22')}
    <pattern id="p-waves" width="80" height="34" patternUnits="userSpaceOnUse"><path d="M0,17 q10,-8 20,0 t20,0 t20,0 t20,0" stroke="#bfe6ec" stroke-opacity=".10" stroke-width="2" fill="none"/></pattern>
    <filter id="f-shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2.5" stdDeviation="2.5" flood-color="#000" flood-opacity=".45"/></filter>
    <filter id="f-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="c-hex"><polygon points="${HEX}"/></clipPath>
    ${pine}${oak}${bricks}${sheep}${tuft}${wheat}${cactus}${ore}
  </defs>${symbols}${iconSymbols}`;

  window.ART = {
    HEX,
    install() {
      const holder = document.createElement('div');
      holder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;width:0;height:0" aria-hidden="true">${defs}</svg>`;
      document.body.prepend(holder.firstChild);
    },
    icon: (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 32 32" aria-hidden="true"><use href="#ic-${name}"/></svg>`,
  };
})();
