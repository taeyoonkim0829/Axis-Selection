// After a new deploy, GitHub Pages serves only the new build's files: a page opened before it fails to load the
// chunks it loads on demand (3D preview, DXF, PDF) because their hashed names changed. Reloading fixes it.

/** The message of a failed dynamic import (Chrome, Firefox, Safari wording). */
export function isStaleBuild(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /dynamically imported module|Importing a module script failed/i.test(message)
}

/** Shown in place of the browser's message (inputs are not kept across a reload). */
export const STALE_BUILD_NOTICE = '새 버전이 배포되었습니다. 페이지를 새로 고침해 주세요. 입력값은 초기화됩니다.'
