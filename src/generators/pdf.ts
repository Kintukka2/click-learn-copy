// PDF written guide: the HTML guide (print mode) rendered by headless Chromium.
import { chromium } from "playwright";
import { MIME, brandOf, coverMeta, escapeHtml, labels, outputFilename } from "./common.js";
import { renderGuideHtml } from "./html.js";
import type { GeneratedFile, GeneratorContext } from "./index.js";

export async function generatePdf(ctx: GeneratorContext): Promise<GeneratedFile> {
  const html = await renderGuideHtml(ctx, { print: true });
  const brand = brandOf(ctx.project);
  const meta = coverMeta(ctx);
  const L = labels(ctx.process.lang);

  // Header/footer templates render in their own context: styles must be inline and font sizes explicit.
  const base = `font-family:Inter,'Segoe UI',Arial,sans-serif;font-size:8px;color:#64748b;width:100%;margin:0 16mm;display:flex;align-items:center;-webkit-print-color-adjust:exact;`;
  const headerTemplate = `<div style="${base}padding-bottom:3mm;border-bottom:0.6px solid #e2e8f0;">
    <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${brand.primary};margin-right:6px;"></span>
    <span style="font-weight:600;color:#0f172a;letter-spacing:.06em;text-transform:uppercase;">${escapeHtml(brand.companyName)}</span>
    <span style="margin-left:auto;">${escapeHtml(ctx.process.title)}</span></div>`;
  const footerTemplate = `<div style="${base}padding-top:3mm;">
    <span>${escapeHtml([meta.chapter, meta.dateText].filter(Boolean).join("  ·  "))}</span>
    <span style="margin-left:auto;">${escapeHtml(L("page"))} <span class="pageNumber" style="color:#0f172a;font-weight:600;"></span> / <span class="totalPages"></span></span></div>`;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.emulateMedia({ media: "print" });
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      margin: { top: "22mm", bottom: "20mm", left: "16mm", right: "16mm" },
      tagged: true,
      outline: true,
    });
    return { buffer: Buffer.from(pdf), filename: outputFilename(ctx.process, "pdf"), mime: MIME.pdf };
  } finally {
    await browser.close();
  }
}
