---
status: accepted
date: 2026-09-26
---
# 0019. No AirPlay; Cast is the way to play on other devices

## Context
AirPlay was requested alongside Cast.

## Decision
Drop AirPlay. On macOS, AVKit's `AVRoutePickerView` only routes an `AVPlayer`, and MCO's audio is
Chromium Web Audio (the FX chain), so the picker can't move it. CoreAudio exposes no AirPlay device
until the user picks one in Control Center, so there's no public API for MCO to discover or select
receivers. AirPlay's ~2 s buffer would also delay live FX and the siren.

## Alternatives considered
- An `AVRoutePickerView` add-on: can't route Web Audio (don't re-propose it).
- Untested: a picker with no player, or a button opening System Settings → Sound.

## Consequences
- Users can still send the Mac's whole output to AirPlay from Control Center, outside MCO.
- See [research](../research/cast-devices.md#airplay).
