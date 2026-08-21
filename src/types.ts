export interface Track {
  id: number
  path: string
  filename: string
  folder: string
  format: string
  size: number
  mtime: number
  duration: number | null
  title: string | null
  artist: string | null
  album: string | null
  genreTag: string | null
  year: number | null
  bpm: number | null
  musicalKey: string | null
  waveformPeaks: number[] | null
  cloudStatus: 'local' | 'cloud_only'
  analysisStatus: 'pending' | 'analyzing' | 'done' | 'error'
}

export interface Genre {
  id: number
  name: string
}

export interface Subgenre {
  id: number
  name: string
  genreId: number
}

export interface Mood {
  id: number
  name: string
}

export interface BackupInfo {
  backupFolder: string
  lastBackupAt: string | null
  lastBackupError: string | null
}
