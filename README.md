# Suivi

A small personal page for tracking practice.

## Sync

Data is encrypted with a passphrase before being synced across devices through a secret GitHub gist. The passphrase cannot be recovered: if it is forgotten, disconnecting the device, deleting the `suivi-piano.json` gist on GitHub and reconnecting with a new passphrase creates a new gist from the device's local data.

## Reading

The Reading tab is a note-reading drill: a note appears on the staff and you name it with the buttons, the keyboard (C to B or 1 to 7) or, in Chrome with a MIDI piano connected, by playing it. Notes you miss or read slowly come back more often. Per-note stats and finished rounds sync through the gist with the sessions; the drill settings stay on each device.

The clef and note shapes in `js/glyphs.js` come from the Bravura font by Steinberg Media Technologies, licensed under the SIL Open Font License 1.1.

## Tempo

A MIDI recording can be played back with the tempo of each hand drawn as it plays: tap "Tempo" next to a MIDI recording of a session, or open any `.mid` file from the Statistics tab. Notes are split between the hands by following where each hand is on the keyboard. Each gap between two notes of a hand is matched to the note value it most likely is (sixteenth to half note) given the tempo so far, and the tempo shown is the median over the last 4 seconds. Long notes, rests and hesitations match no note value well and are left out, so a line breaks where there is nothing short enough to measure. The reference tempo is estimated from the most common gap between notes and can be adjusted. Everything runs on the device; the playback uses a small synthesized piano, not samples.
