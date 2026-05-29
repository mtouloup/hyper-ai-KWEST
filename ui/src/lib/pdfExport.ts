import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";

const TAB_NAMES = ["Basic Stats", "Detailed Stats", "Trace Stats"];
const TAB_INDEXES = [0, 1, 2];

export interface ExportPdfOptions {
  runId: string;
  runName?: string;
  renderTab: (tabIndex: number, container: HTMLDivElement) => Promise<HTMLElement>;
  onDone?: () => void;
}

interface Row {
  top: number;
  bottom: number;
  breakAfter: boolean; // force a page break after this row
}

function getRows(element: HTMLElement, imgHeight: number): Row[] {
  const cards = element.querySelectorAll("section");
  if (cards.length === 0) return [];

  const containerRect = element.getBoundingClientRect();
  const scaleY = imgHeight / containerRect.height;

  // Collect raw card info
  const rawCards: { top: number; bottom: number; breakAfter: boolean }[] = [];
  for (const card of Array.from(cards)) {
    const r = card.getBoundingClientRect();
    rawCards.push({
      top: (r.top - containerRect.top) * scaleY,
      bottom: (r.bottom - containerRect.top) * scaleY,
      breakAfter: card.hasAttribute("data-pdf-page-break"),
    });
  }
  rawCards.sort((a, b) => a.top - b.top);

  // Group cards into visual rows (cards whose tops are within 8px)
  const rows: Row[] = [];
  for (const c of rawCards) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(c.top - last.top) < 8) {
      last.bottom = Math.max(last.bottom, c.bottom);
      if (c.breakAfter) last.breakAfter = true;
    } else {
      rows.push({ top: c.top, bottom: c.bottom, breakAfter: c.breakAfter });
    }
  }
  return rows;
}

/**
 * Walk through rows, accumulating them onto pages.
 * Cut when: accumulated height would overflow OR previous row had breakAfter.
 */
function buildCuts(
  rows: Row[],
  imgHeight: number,
  firstPageMaxPx: number,
  laterPageMaxPx: number,
): number[] {
  if (rows.length === 0) return [0, imgHeight];

  const cuts: number[] = [0];
  let pageStart = 0;
  let isFirst = true;
  let mustBreak = false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const maxPx = isFirst ? firstPageMaxPx : laterPageMaxPx;

    // If previous row demanded a break, start a new page before this row
    if (mustBreak) {
      const cutY = Math.ceil(row.top);
      if (cutY > pageStart + 4) {
        cuts.push(cutY);
        pageStart = cutY;
        isFirst = false;
      }
      mustBreak = false;
    }

    // Check if this row's bottom exceeds the current page
    if (row.bottom - pageStart > maxPx) {
      // If this isn't the first row on this page, cut before it
      if (row.top - pageStart > 8) {
        const cutY = Math.ceil(row.top);
        cuts.push(cutY);
        pageStart = cutY;
        isFirst = false;
      }
      // If the single row is taller than a full page, it'll overflow — that's OK
    }

    if (row.breakAfter) {
      mustBreak = true;
    }
  }

  if (cuts[cuts.length - 1] < imgHeight) {
    cuts.push(imgHeight);
  }
  return cuts;
}

async function capturePage(
  pdf: jsPDF,
  element: HTMLElement,
  title: string,
  isFirst: boolean,
) {
  const dataUrl = await toPng(element, {
    backgroundColor: "#ffffff",
    pixelRatio: 2,
  });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const headerH = 16;
  const contentY = margin + headerH;

  // Use 85% of available width — keeps charts compact and centered
  const fullW = pageW - margin * 2;
  const maxW = fullW * 0.85;
  const firstPageMaxH = pageH - contentY - margin;
  const laterPageMaxH = pageH - margin * 2;

  if (!isFirst) pdf.addPage();

  pdf.setFontSize(14);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(30, 30, 30);
  pdf.text(title, pageW / 2, margin + 8, { align: "center" });
  pdf.setFont("helvetica", "normal");

  const img = await loadImage(dataUrl);
  const imgW = maxW;
  const imgH = imgW / (img.width / img.height);
  const imgX = (pageW - imgW) / 2;

  if (imgH <= firstPageMaxH) {
    pdf.addImage(dataUrl, "PNG", imgX, contentY, imgW, imgH);
    return;
  }

  const pxPerMm = img.height / imgH;
  const firstSliceMaxPx = firstPageMaxH * pxPerMm;
  const laterSliceMaxPx = laterPageMaxH * pxPerMm;

  const rows = getRows(element, img.height);
  const cuts =
    rows.length > 0
      ? buildCuts(rows, img.height, firstSliceMaxPx, laterSliceMaxPx)
      : uniformCuts(img.height, firstSliceMaxPx, laterSliceMaxPx);

  for (let s = 0; s < cuts.length - 1; s++) {
    const srcY = cuts[s];
    const srcH = cuts[s + 1] - srcY;
    if (srcH < 2) continue;

    const yPos = s === 0 ? contentY : margin;
    if (s > 0) pdf.addPage();

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = Math.round(srcH);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, srcY, img.width, srcH, 0, 0, canvas.width, canvas.height);

    const sliceUrl = canvas.toDataURL("image/png");
    const sliceH = srcH / pxPerMm;
    pdf.addImage(sliceUrl, "PNG", imgX, yPos, imgW, sliceH);
  }
}

function uniformCuts(
  totalH: number,
  firstMax: number,
  laterMax: number,
): number[] {
  const cuts = [0];
  let pos = firstMax;
  while (pos < totalH) {
    cuts.push(Math.ceil(pos));
    pos += laterMax;
  }
  cuts.push(totalH);
  return cuts;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = dataUrl;
  });
}

export async function exportSimulationPdf(opts: ExportPdfOptions) {
  const { runId, runName, renderTab, onDone } = opts;

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const docTitle = runName ? `${runId} | ${runName}` : runId;

  try {
    for (let i = 0; i < TAB_INDEXES.length; i++) {
      const tabIdx = TAB_INDEXES[i];
      const offscreen = document.createElement("div");
      offscreen.style.cssText =
        "position:fixed;left:-9999px;top:0;width:1200px;background:#fff;z-index:-1;";
      document.body.appendChild(offscreen);

      try {
        const element = await renderTab(tabIdx, offscreen);
        await new Promise((r) => setTimeout(r, 600));
        await capturePage(pdf, element, `${docTitle} — ${TAB_NAMES[i]}`, i === 0);
      } finally {
        document.body.removeChild(offscreen);
      }
    }

    pdf.save(`simulation_${runId}.pdf`);
  } finally {
    onDone?.();
  }
}
