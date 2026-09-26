---
status: accepted
date: 2026-09-26
---
# 0022. A cast session keeps the Mac awake, ends when the TV moves on, and dies on missed heartbeats

## Context
Three ways a session went wrong (2026-09-26):
1. The Mac idle-slept while casting; the TV streams from it, so playback hung.
2. Opening Plex on the Google TV only backgrounded MCO's app — the TV itself still listed MCO as the
   running app — so MCO kept showing "casting".
3. A silently dead connection (e.g. after sleep) was never noticed.

## Decision
1. Hold a `powerSaveBlocker('prevent-app-suspension')` while a session is connecting or casting
   (the display can still sleep).
2. The receiver ends the session (`context.stop()`) after 5 s out of view (`visibilitychange`).
3. The device answers every heartbeat PING (verified); the connection fails after **4 heartbeats in
   a row** (~20 s) with nothing heard. Counting beats, not wall-clock silence, matters: 1.0.42 timed
   20 s of silence, and when MCO's main process was busy (a synchronous scan) the timer and the queued
   replies both ran late, so a healthy TV was dropped while it kept playing — fixed in 1.0.43.

## Consequences
- A MacBook still sleeps when its lid is closed (unless an external display is attached).
- Switching the TV's input or turning it off may also end the session, via visibility.
