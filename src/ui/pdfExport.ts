// Calculation report → PDF, entirely in the browser. Each chapter is rendered to an image and placed on A4
// pages (a chapter taller than a page continues on the next), so Korean text needs no embedded PDF font.
import { translate, type Lang } from '../i18n'

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 12

/** Builds the PDF from a mounted `Report`. The libraries load only when a PDF is made. */
export async function reportToPdf(root: HTMLElement, title: string): Promise<Blob> {
  const [{ jsPDF }, { domToCanvas }] = await Promise.all([import('jspdf'), import('modern-screenshot')])
  await document.fonts.ready

  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  pdf.setProperties({ title })
  const contentW = PAGE_W - 2 * MARGIN
  const contentH = PAGE_H - 2 * MARGIN
  let firstPage = true

  for (const chapter of root.querySelectorAll<HTMLElement>('.report-chapter')) {
    const canvas = await domToCanvas(chapter, { scale: 2, backgroundColor: '#ffffff' })
    const mmPerPx = contentW / canvas.width
    const pagePx = Math.floor(contentH / mmPerPx)
    for (let top = 0; top < canvas.height; top += pagePx) {
      const slice = document.createElement('canvas')
      slice.width = canvas.width
      slice.height = Math.min(pagePx, canvas.height - top)
      slice.getContext('2d')!.drawImage(canvas, 0, -top)
      if (!firstPage) pdf.addPage()
      firstPage = false
      pdf.addImage(slice, 'PNG', MARGIN, MARGIN, contentW, slice.height * mmPerPx, undefined, 'FAST')
    }
  }
  return pdf.output('blob')
}

/** Suggested file name / PDF title: 축선정_<axis model>_<yyyy-mm-dd> (AxisSelection_… in English). */
export function reportTitle(axisModel: string, lang: Lang): string {
  const date = new Date().toISOString().slice(0, 10)
  return translate(lang, '축선정_{model}_{date}', { model: axisModel, date }).replace(/[\\/:*?"<>|]/g, '_')
}

/**
 * Opens a tab right away (inside the click, so popup blockers allow it) that shows a waiting message
 * until the PDF is ready.
 */
export function openPendingTab(lang: Lang): Window | null {
  const win = window.open('', '_blank')
  if (win) {
    const text = translate(lang, 'PDF 생성 중…')
    win.document.title = text
    win.document.body.style.cssText = 'font-family: sans-serif; display: grid; place-items: center; height: 100vh; margin: 0; color: #5b6672'
    win.document.body.textContent = text
  }
  return win
}
