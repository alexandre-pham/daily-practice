# Suivi

A small personal page for tracking practice.

## Sync

Data is saved on the device and, once signed in to the account (Settings → Account), synced across devices through Firebase (see "Account and cloud sync" below).

## Reading

The Reading tab is a note-reading drill: a note appears on the staff and you name it with the buttons, the keyboard (C to B or 1 to 7) or, in Chrome with a MIDI piano connected, by playing it. Notes you miss or read slowly come back more often. Per-note stats and finished rounds sync with the sessions; the drill settings stay on each device.

Beyond the note drill, the Reading tab holds a path of sight-reading exercises (`js/ex/`), run by `js/ui/exrun.js` with the scores drawn by `js/ui/score.js` and the music theory in `js/theory.js` (tests: `node test/theory.test.mjs`). So far: intervals (from steps and skips to harmonic intervals and short patterns) and key signatures (tonic, relative minor, scale), each with levels and short theory lessons (`js/lessons.js`). Answers are played on the MIDI piano, or chosen with buttons. Per-item stats (`read.skills`, one record per item such as `int:t:3M:up`) and rounds sync like the note stats; exercise settings stay on each device.

The clef and note shapes in `js/glyphs.js` come from the Bravura font by Steinberg Media Technologies, licensed under the SIL Open Font License 1.1.

## Tempo

A MIDI recording can be played back with the tempo of each hand drawn as it plays: tap "Tempo" next to a MIDI recording of a session, or open any `.mid` file from the Statistics tab. Notes are split between the hands by following where each hand is on the keyboard. From each note of a hand, the time to the first note at least about a beat later is matched to 1, 1.5 or 2 beats given the tempo so far, so uneven subdivisions (a long-short pair of eighths) cancel out instead of biasing the result. The tempo shown is the median over the last 4 seconds. Long notes, rests and hesitations match none of these spans well and are left out, so a line breaks where there is nothing short enough to measure. The reference tempo is estimated from the most common gap between notes and can be adjusted. Everything runs on the device. Playback uses the Salamander Grand Piano samples by Alexander Holm (a Yamaha C5 grand, CC BY 3.0), stored in `audio/piano/` and loaded the first time the tempo panel is opened.

## Account and cloud sync

Signing in (Settings → Account, email and password through Firebase Auth) syncs sessions, activities and reading stats with Firestore, under `users/{uid}/` with one document per record. Each record carries a timestamp and the most recent copy wins; deletions are kept as markers so they sync too. Listeners only read documents written since the last sync, and only records newer than the server's copy are written. The security rules are in `firestore.rules`. The Firebase SDK (13.1.0) is vendored in `js/vendor/firebase/` and loaded only once signed in. Accounts are created in the Firebase console; sign-up from the app is turned off.

MIDI recordings are uploaded to Cloud Storage at `users/{uid}/recordings/{id}.mid` by the device that made them; the recording's `cloud` flag in its session then syncs, so other devices download the file when it is opened and keep it in IndexedDB. The Recordings tab lists them by month, with renaming (stored as the recording's `name` in its session), tempo analysis, download and deletion. The Storage security rules are in `storage.rules`.
