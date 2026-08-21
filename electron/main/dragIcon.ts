import { nativeImage, type NativeImage } from 'electron'

// A small generic "audio file" glyph, embedded as base64 rather than a
// bundled asset — electron-vite's main-process build doesn't copy plain
// image files referenced by fs path into out/, so a data URL sidesteps any
// packaged-vs-dev path resolution entirely (same class of problem the
// ffmpeg-static asar path bug was, avoided here by construction).
const DRAG_ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAABXklEQVR4nO3b0ZGDIBQF0OsdOtkSto6UkEbitzayJWwdKSG1ZL83EzTAEx5ezl8mA3oRnsokwDAMyqacRref3yecWq+XpEzTWYLnDsR0tuCpA8Ezh//k/FnSuBdbOZjTqEexPIQ4Klz9rVyEOKpc/Vi+gM4s31//Ps/3R1F/hDhCHCGOEEeICx4qeUuEOEIcIY4QF1octOTx1bqAEuIIcYQ4QhwhjhBHiCPEBTj17oGndP+vmxmwRJ72jniNJpypvVdAONJio4RwotUuESEu9F7FXc6ApVIVtxhQwtheSE87wuYD8Gk4i+VhtZxo0kvGlS0ZBMtaQjizF866kBIOxUIecRcJcKrWLZMQR6uOWlVxVzNgblDF3S2BuXIVNx+ANfH39q2reKrXfOGoA3kIm70EVoNZ4NG7XIQ4xr442yyI5WFOo95s5WBJ4x7snf+U0pnsv8Z6GojeZ+wwoK4/CmJ9NRdjG7IAAAAASUVORK5CYII='

let cachedIcon: NativeImage | null = null

export function getDragIcon(): NativeImage {
  if (!cachedIcon) {
    cachedIcon = nativeImage.createFromDataURL(`data:image/png;base64,${DRAG_ICON_BASE64}`)
  }
  return cachedIcon
}
