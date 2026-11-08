# Suivi

A small personal page for tracking practice.

## Sync

Data is encrypted with a passphrase before being synced across devices through a secret GitHub gist. The passphrase cannot be recovered: if it is forgotten, disconnecting the device, deleting the `suivi-piano.json` gist on GitHub and reconnecting with a new passphrase creates a new gist from the device's local data.

## Reading

The Reading tab is a note-reading drill: a note appears on the staff and you name it with the buttons, the keyboard (C to B or 1 to 7) or, in Chrome with a MIDI piano connected, by playing it. Notes you miss or read slowly come back more often. Per-note stats and finished rounds sync through the gist with the sessions; the drill settings stay on each device.

The clef and note shapes in `js/glyphs.js` come from the Bravura font by Steinberg Media Technologies, licensed under the SIL Open Font License 1.1.

## Tempo

A MIDI recording can be played back with the tempo of each hand drawn as it plays: tap "Tempo" next to a MIDI recording of a session, or open any `.mid` file from the Statistics tab. Notes are split between the hands by following where each hand is on the keyboard. From each note of a hand, the time to the first note at least about a beat later is matched to 1, 1.5 or 2 beats given the tempo so far, so uneven subdivisions (a long-short pair of eighths) cancel out instead of biasing the result. The tempo shown is the median over the last 4 seconds. Long notes, rests and hesitations match none of these spans well and are left out, so a line breaks where there is nothing short enough to measure. The reference tempo is estimated from the most common gap between notes and can be adjusted. Everything runs on the device. Playback uses the Salamander Grand Piano samples by Alexander Holm (a Yamaha C5 grand, CC BY 3.0), stored in `audio/piano/` and loaded the first time the tempo panel is opened.

## Account and cloud sync

Signing in (Settings → Account, email and password through Firebase Auth) syncs sessions, activities and note-reading stats with Firestore, under `users/{uid}/` with one document per record. As with the gist, each record carries a timestamp and the most recent copy wins; deletions are kept as markers so they sync too. Listeners only read documents written since the last sync, and only records newer than the server's copy are written. The security rules are in `firestore.rules`. The Firebase SDK (app, auth, firestore 13.1.0) is vendored in `js/vendor/firebase/` and loaded only once signed in. The gist sync keeps working alongside until it is removed.

