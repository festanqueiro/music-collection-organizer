// src/bootSplash.ts
// Fades out and removes index.html's #boot-splash, so the app appears
// fully populated instead of visibly assembling itself. Safe to call more
// than once.
export function hideBootSplash(): void {
  const splash = document.getElementById('boot-splash')
  if (!splash || splash.dataset.hidden !== undefined) return
  // Two frames: lets React commit and the browser paint the populated UI
  // underneath before the fade starts.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      splash.dataset.hidden = ''
      splash.addEventListener('transitionend', () => splash.remove(), { once: true })
      // transitionend doesn't fire if the window is hidden mid-fade.
      setTimeout(() => splash.remove(), 500)
    })
  )
}
