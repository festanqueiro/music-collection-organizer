// Fills a fresh MCO data folder from the demo collection, through the app's
// own API: scan, analyse, Tags/Subtags with colours, a few playlists.
// Used by capture.mjs; see website/capture/README.md.

// Folder → Tag, and Subtags handed out round-robin inside it.
const TAGS = [
  { folder: 'Dub & Steppers', tag: 'Dub', color: '#e0b84a', subtags: ['Steppers', 'Roots'] },
  { folder: 'Jungle', tag: 'Jungle', color: '#e2654a', subtags: ['Rollers', 'Ragga'] },
  { folder: '140', tag: 'Dubstep', color: '#8f7cf0', subtags: ['Deep', '140 Dub'] },
  { folder: 'UK Garage', tag: 'UK Garage', color: '#4ab7e0', subtags: ['2-Step'] },
  { folder: 'House & Techno', tag: 'House', color: '#5ccf8a', subtags: ['Deep House', 'Tech'] },
]

export async function setupLibrary(win) {
  await win.evaluate(async (TAGS) => {
    const api = window.api
    await api.scanCollection()
    await api.analyzeCollection()
    // Analysis runs in the background; wait until every track is done.
    for (let i = 0; i < 600; i++) {
      const tracks = await api.getTracks()
      if (tracks.length && tracks.every((t) => t.analysisStatus === 'done' || t.analysisStatus === 'error')) break
      await new Promise((r) => setTimeout(r, 1000))
    }
    const tracks = (await api.getTracks()).sort((a, b) => a.path.localeCompare(b.path))
    const byTag = {}
    for (const t of TAGS) {
      const genreId = await api.createGenre(t.tag)
      await api.setGenreColor(genreId, t.color)
      const subIds = []
      for (const s of t.subtags) subIds.push(await api.createSubgenre(s, genreId))
      const mine = tracks.filter((tr) => tr.folder.includes(t.folder))
      byTag[t.tag] = mine.map((tr) => tr.id)
      for (const [i, tr] of mine.entries()) {
        // A couple left untagged, so the Untagged filter has something.
        if (i === mine.length - 1 && t.tag !== 'Dub') continue
        await api.setTrackGenres(tr.id, [genreId])
        await api.setTrackSubgenres(tr.id, [subIds[i % subIds.length]])
      }
    }
    // A few of the Dub songs are also Dubstep-ish.
    // Playlists: a folder of sets and a couple of loose ones.
    const sets = (await api.createPlaylistNode('folder', 'Sets 2026', null)).id
    const sunday = (await api.createPlaylistNode('playlist', 'Sunday Session', sets)).id
    const warmup = (await api.createPlaylistNode('playlist', 'Warm-up', sets)).id
    const jungle = (await api.createPlaylistNode('playlist', 'Jungle Selects', null)).id
    await api.createPlaylistNode('playlist', 'Late Night 140', null)
    await api.addTracksToPlaylist(sunday, [...byTag['Dub'].slice(0, 5), ...byTag['Dubstep'].slice(0, 4)])
    await api.addTracksToPlaylist(warmup, [...byTag['House'].slice(0, 4), ...byTag['UK Garage'].slice(0, 3)])
    await api.addTracksToPlaylist(jungle, byTag['Jungle'])
  }, TAGS)
  await win.reload()
  await win.waitForLoadState('domcontentloaded')
  await win.waitForTimeout(2500)
}
