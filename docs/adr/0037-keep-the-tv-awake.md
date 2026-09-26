---
status: accepted
date: 2026-09-27
amends: 0022
---
# 0037. Keep the TV's screen awake during a session; say why a session ends

## Context
Casting still dropped after ~7 minutes (2026-09-27). A monitor showed the **TV** ended the session:
its running-app list went from MCO to empty while the Mac's connection was fine up to that moment.
MCO's receiver plays audio itself (not through the Cast framework's media player), so Google TV
doesn't know anything is playing and starts its screensaver after a few idle minutes; that hid the
receiver, and 1.0.42's "out of view for 5 s → end the session" rule
([ADR 0022](0022-cast-session-lifetime.md)) ended it.

## Decision
- The receiver holds a **screen wake lock** (`navigator.wakeLock.request('screen')`) for the session,
  taken at start, on each track load and whenever the page becomes visible again.
- The out-of-view grace goes from 5 s to **30 s**.
- Before ending the session itself, the receiver sends MCO a `goodbye` message; MCO then shows
  "The TV went to another app or its screensaver" instead of the session silently vanishing.

## Consequences
- Whether the Chromecast's Cast runtime honours the Wake Lock API is **[UNVERIFIED]** until the
  receiver is deployed and tried; if it doesn't, the goodbye message will say so next time it drops.
- Switching the TV to another app now ends casting after 30 s instead of 5 s.
