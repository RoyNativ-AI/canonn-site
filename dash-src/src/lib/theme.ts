export type Theme = 'light' | 'dark'

export function readTheme(): Theme {
  const saved = localStorage.getItem('canonn.theme') as Theme | null
  if (saved) return saved
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark')
  localStorage.setItem('canonn.theme', t)
}
