import { useEffect, useRef, useState } from 'react'
import { useCollectionStore } from '../state/store'
import { TagColorPopover } from './TagColorPopover'
import { ContextMenu } from './ContextMenu'
import { ipcErrorMessage } from '../ipcError'

export type TagMenuTarget = { kind: 'genre'; id: number; name: string } | { kind: 'subgenre'; id: number; name: string }

// A Tag's or Subtag's right-click menu — Rename, Choose color…, Delete —
// shared by the Tags and Subtags views so a subtag gets the same options
// wherever it's listed. The owner calls openContextMenu on a row's
// right-click, shows renameField(name) in place of the row's name while
// isRenaming(kind, id), and renders `menus`.
export function useTagContextMenu() {
  const genres = useCollectionStore((s) => s.genres)
  const subgenres = useCollectionStore((s) => s.subgenres)
  const deleteGenre = useCollectionStore((s) => s.deleteGenre)
  const deleteSubgenre = useCollectionStore((s) => s.deleteSubgenre)
  const renameGenre = useCollectionStore((s) => s.renameGenre)
  const renameSubgenre = useCollectionStore((s) => s.renameSubgenre)
  const showToast = useCollectionStore((s) => s.showToast)
  const setGenreColor = useCollectionStore((s) => s.setGenreColor)
  const setSubgenreColor = useCollectionStore((s) => s.setSubgenreColor)

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: TagMenuTarget } | null>(null)
  // "Choose color…" opens this where the menu was.
  const [colorPicker, setColorPicker] = useState<{ x: number; y: number; target: TagMenuTarget } | null>(null)
  const [renaming, setRenaming] = useState<TagMenuTarget | null>(null)

  useEffect(() => {
    if (!contextMenu) return
    function close() {
      setContextMenu(null)
    }
    window.addEventListener('click', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', close)
    }
  }, [contextMenu])

  // Renamed in its row, like a playlist (Electron has no window.prompt).
  // Enter and the blur that follows both commit; only the first counts.
  const renamingRef = useRef<TagMenuTarget | null>(null)
  renamingRef.current = renaming
  async function commitRename(newName: string) {
    const target = renamingRef.current
    renamingRef.current = null
    setRenaming(null)
    if (!target || !newName.trim() || newName.trim() === target.name) return

    const count =
      target.kind === 'genre'
        ? await window.api.countTracksWithGenre(target.id)
        : await window.api.countTracksWithSubgenre(target.id)

    if (count > 0) {
      const proceed = window.confirm(`${count} file${count === 1 ? ' is' : 's are'} affected by this change, are you sure?`)
      if (!proceed) return
    }

    try {
      if (target.kind === 'genre') await renameGenre(target.id, newName.trim())
      else await renameSubgenre(target.id, newName.trim())
    } catch (err) {
      // A name another Tag already has, whatever its capitals.
      showToast(ipcErrorMessage(err))
    }
  }

  async function handleDelete(target: TagMenuTarget) {
    const count =
      target.kind === 'genre'
        ? await window.api.countTracksWithGenre(target.id)
        : await window.api.countTracksWithSubgenre(target.id)

    const label = target.kind === 'genre' ? 'tag' : 'subtag'
    const proceed = window.confirm(
      count > 0
        ? `Are you sure you want to delete this ${label}? ${count} file${count === 1 ? ' is' : 's are'} tagged with it.`
        : `Are you sure you want to delete this ${label}?`
    )
    if (!proceed) return

    if (target.kind === 'genre') await deleteGenre(target.id)
    else await deleteSubgenre(target.id)
  }

  function openContextMenu(e: React.MouseEvent, target: TagMenuTarget) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, target })
  }

  function isRenaming(kind: TagMenuTarget['kind'], id: number): boolean {
    return renaming?.kind === kind && renaming.id === id
  }

  const renameField = (name: string) => (
    <input
      autoFocus
      defaultValue={name}
      aria-label={`New name for ${name}`}
      onFocus={(e) => e.currentTarget.select()}
      // Not the row's tick box.
      onClick={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') void commitRename(e.currentTarget.value)
        if (e.key === 'Escape') {
          renamingRef.current = null
          setRenaming(null)
        }
      }}
      onBlur={(e) => void commitRename(e.currentTarget.value)}
      style={{ flex: 1, minWidth: 0, height: '18px', padding: '0 4px', fontSize: 'inherit' }}
    />
  )

  const menuItemStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    textAlign: 'left' as const,
    background: 'none',
    border: 'none',
    padding: '4px 8px',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  }

  const menus = (
    <>
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)}>
          <button
            onClick={() => {
              setRenaming(contextMenu.target)
              setContextMenu(null)
            }}
            style={menuItemStyle}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
              edit
            </span>
            Rename
          </button>
          <button
            onClick={() => {
              setColorPicker({ x: contextMenu.x, y: contextMenu.y, target: contextMenu.target })
              setContextMenu(null)
            }}
            style={menuItemStyle}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
              palette
            </span>
            Choose color…
          </button>
          <button
            onClick={() => {
              handleDelete(contextMenu.target)
              setContextMenu(null)
            }}
            style={menuItemStyle}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
              delete
            </span>
            Delete
          </button>
        </ContextMenu>
      )}

      {colorPicker && (
        <TagColorPopover
          x={colorPicker.x}
          y={colorPicker.y}
          current={
            (colorPicker.target.kind === 'genre' ? genres : subgenres).find((t) => t.id === colorPicker.target.id)?.color ?? null
          }
          onPick={(color) => {
            if (colorPicker.target.kind === 'genre') setGenreColor(colorPicker.target.id, color)
            else setSubgenreColor(colorPicker.target.id, color)
            setColorPicker(null)
          }}
          onClose={() => setColorPicker(null)}
        />
      )}
    </>
  )

  return { openContextMenu, isRenaming, renameField, menus }
}
