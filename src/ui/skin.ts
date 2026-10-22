// Screen skins: A (blueprint glass) is the app's look; B and C are design alternatives shown on the same app,
// chosen in the footer or by the address (?skin=graphite / ?skin=cockpit). `<html data-skin>` carries the
// choice; index.css restyles by it.

export type Skin = 'blueprint' | 'graphite' | 'cockpit'

export const SKINS: { id: Skin; name: string }[] = [
  { id: 'blueprint', name: 'A · Blueprint Glass' },
  { id: 'graphite', name: 'B · Graphite Mono' },
  { id: 'cockpit', name: 'C · Cockpit' },
]

const PARAM = 'skin'
const isSkin = (value: string | null): value is Skin => SKINS.some((s) => s.id === value)

/** The skin in the address, else A */
export function skinFromUrl(): Skin {
  const value = new URLSearchParams(window.location.search).get(PARAM)
  return isSkin(value) ? value : 'blueprint'
}

export const currentSkin = (): Skin => {
  const value = document.documentElement.dataset.skin ?? null
  return isSkin(value) ? value : 'blueprint'
}

/** Shows `skin` and keeps it in the address (A: no parameter), so the page can be linked and reloaded. */
export function applySkin(skin: Skin) {
  if (skin === 'blueprint') delete document.documentElement.dataset.skin
  else document.documentElement.dataset.skin = skin
  const url = new URL(window.location.href)
  if (skin === 'blueprint') url.searchParams.delete(PARAM)
  else url.searchParams.set(PARAM, skin)
  window.history.replaceState(window.history.state, '', url.toString())
}
