'use strict';
// Copies the recorded tutorial game out of the web app's tutorial.js into the Android app (app/src/main/assets/tutorial.json).
//   node android-native/tools/make-tutorial.js
// Run it again after the web tutorial is re-recorded (see "Animated tutorial" in the README).
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'tutorial.js'), 'utf8');
const m = src.match(/const TUT_REC = (\{.*\});\n/);
if (!m) throw new Error('TUT_REC not found in tutorial.js');
const rec = JSON.parse(m[1]);
const out = path.join(__dirname, '..', 'app', 'src', 'main', 'assets');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'tutorial.json'), JSON.stringify(rec));
console.log('wrote tutorial.json:', rec.steps.length, 'recorded steps,', rec.board.tiles.length, 'tiles');
