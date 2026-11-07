# Suivi

A small personal page for tracking practice.

## Sync

Data is encrypted with a passphrase before being synced across devices through a secret GitHub gist. The passphrase cannot be recovered: if it is forgotten, disconnecting the device, deleting the `suivi-piano.json` gist on GitHub and reconnecting with a new passphrase creates a new gist from the device's local data.

## Reading

The Reading tab is a note-reading drill: a note appears on the staff and you name it with the buttons, the keyboard (C to B or 1 to 7) or, in Chrome with a MIDI piano connected, by playing it. Notes you miss or read slowly come back more often. Results stay on the device and are not synced.

The clef and note shapes in `js/glyphs.js` come from the Bravura font by Steinberg Media Technologies, licensed under the SIL Open Font License 1.1.
