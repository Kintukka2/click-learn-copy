// Standalone HTML written guide: one self-contained file (inline CSS, screenshots as data URIs).
// renderGuideHtml() is also the source for the PDF generator (print mode).
import { richText } from "../core/instructions.js";
import { pngDataUrl } from "./annotate.js";
import { MIME, brandOf, coverMeta, escapeHtml, isNote, labels, outputFilename, plain, stepDescription, stepImages, stepOf, stepTitle, type Brand } from "./common.js";
import type { GeneratedFile, GeneratorContext } from "./index.js";

export interface GuideHtmlOptions {
  /**
   * Print mode (used for PDF): a full-bleed cover page, no on-screen chrome, page breaks tuned
   * for A4. Running header/footer are expected to come from the PDF renderer.
   */
  print?: boolean;
  /** Dim the screenshot outside the highlighted element. Default true. */
  dim?: boolean;
  /** Fixed generation date (tests). */
  date?: Date;
}

export async function renderGuideHtml(ctx: GeneratorContext, opts: GuideHtmlOptions = {}): Promise<string> {
  const p = ctx.process;
  const brand = brandOf(ctx.project);
  const L = labels(p.lang);
  const meta = coverMeta(ctx, opts.date);
  const images = stepImages(ctx, { dim: opts.dim });
  const total = p.steps.length;

  const logo = brand.logo ? `<img class="logo" src="${brand.logo.dataUrl}" alt="${escapeHtml(brand.companyName)}">` : "";
  const eyebrow = [meta.chapter, L("guide")].filter(Boolean).map(escapeHtml).join(`<span class="dot">•</span>`);
  const metaRows = meta.rows.map((r) => `<div><dt>${escapeHtml(r.label)}</dt><dd>${escapeHtml(r.value)}</dd></div>`).join("");

  const cover = `
<header class="cover">
  <div class="cover-band">
    <div class="brandline">${logo}<span class="company">${escapeHtml(brand.companyName)}</span></div>
    <div class="cover-title">
      <div class="eyebrow">${eyebrow}</div>
      <h1>${escapeHtml(p.title)}</h1>
      ${p.description ? `<p class="lead">${richText(p.description)}</p>` : ""}
    </div>
  </div>
  <div class="cover-meta">
    <dl class="meta">${metaRows}</dl>
  </div>
</header>`;

  const toc = total
    ? `
<section class="overview" aria-labelledby="ov-title">
  <h2 id="ov-title" class="section-title">${escapeHtml(L("inThisGuide"))}</h2>
  <ol class="toc">
    ${p.steps
      .map(
        (s) =>
          `<li><a href="#step-${s.index}"><span class="toc-n">${s.index}</span><span class="toc-t">${richText(stepTitle(s, p.lang))}</span></a></li>`,
      )
      .join("\n    ")}
  </ol>
</section>`
    : "";

  const steps = p.steps
    .map((s) => {
      const img = images.get(s.id)?.full;
      const kicker = escapeHtml(stepOf(p.lang, s.index, total));
      const title = stepTitle(s, p.lang);
      const desc = stepDescription(s);
      if (isNote(s)) {
        return `
<article class="step note-step" id="step-${s.index}">
  <aside class="callout">
    <div class="callout-label"><span class="callout-icon" aria-hidden="true">i</span>${escapeHtml(L("note"))}<span class="callout-kicker">${kicker}</span></div>
    <div class="callout-title">${richText(title)}</div>
    ${desc ? `<p>${richText(desc)}</p>` : ""}
  </aside>
  ${img ? figure(img.png, img.width, img.height, plain(title)) : ""}
</article>`;
      }
      return `
<article class="step${img ? "" : " no-shot"}" id="step-${s.index}">
  <div class="step-head">
    <div class="badge" aria-hidden="true">${s.index}</div>
    <div class="step-text">
      <div class="kicker">${kicker}</div>
      <h3 class="instr">${richText(title)}</h3>
      ${desc ? `<p class="desc">${richText(desc)}</p>` : ""}
    </div>
  </div>
  ${img ? figure(img.png, img.width, img.height, plain(title)) : ""}
</article>`;
    })
    .join("\n");

  const end = `
<footer class="doc-end">
  <div class="done"><span class="check" aria-hidden="true">✓</span>${escapeHtml(L("complete"))}</div>
  <p>${escapeHtml(L("done"))}</p>
  <div class="colophon">${escapeHtml([brand.companyName, meta.dateText, L("generated")].filter(Boolean).join("  ·  "))}</div>
</footer>`;

  return `<!doctype html>
<html lang="${escapeHtml(meta.locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Steplight">
<title>${escapeHtml(p.title)}${brand.companyName ? ` – ${escapeHtml(brand.companyName)}` : ""}</title>
<style>${css(brand, !!opts.print)}</style>
</head>
<body class="${opts.print ? "print" : "screen"}">
<div class="sheet">
${cover}
<main class="content">
${toc}
<section class="procedure" aria-label="${escapeHtml(L("procedure"))}">
<h2 class="section-title">${escapeHtml(L("procedure"))}</h2>
${steps}
</section>
${end}
</main>
</div>
</body>
</html>
`;
}

function figure(png: Buffer, w: number, h: number, alt: string): string {
  return `<figure class="shot"><img src="${pngDataUrl(png)}" width="${w}" height="${h}" alt="${escapeHtml(alt)}"></figure>`;
}

function css(b: Brand, print: boolean): string {
  return `
:root{
  --primary:${b.primary};--primary-dark:${b.primaryDark};--accent:${b.accent};--tint:${b.tint};--accent-tint:${b.accentTint};
  --on-primary:${b.onPrimary};--ink:${b.ink};--body:${b.body};--muted:${b.muted};--line:${b.line};
  --font:"Inter","Segoe UI",system-ui,-apple-system,"Helvetica Neue",Roboto,Arial,sans-serif;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:var(--font);color:var(--body);font-size:15px;line-height:1.6;background:#eef1f6;font-feature-settings:"cv11","ss01";text-rendering:optimizeLegibility}
h1,h2,h3{color:var(--ink);margin:0;font-weight:700;letter-spacing:-.01em}
strong{color:var(--ink);font-weight:650}
a{color:inherit;text-decoration:none}

.sheet{max-width:920px;margin:40px auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,.06),0 12px 40px rgba(15,23,42,.08)}

/* cover */
.cover-band{position:relative;color:var(--on-primary);padding:36px 56px 44px;
  background:radial-gradient(120% 140% at 100% 0%,color-mix(in srgb,var(--accent) 45%,transparent) 0%,transparent 55%),linear-gradient(135deg,var(--primary) 0%,var(--primary-dark) 100%)}
.cover-band::after{content:"";position:absolute;left:0;right:0;bottom:0;height:5px;background:var(--accent)}
.brandline{display:flex;align-items:center;gap:12px;min-height:32px}
.logo{max-height:32px;max-width:160px;object-fit:contain;background:#fff;border-radius:6px;padding:4px 6px}
.company{font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;opacity:.92}
.cover-title{margin-top:56px}
.eyebrow{font-size:12.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;opacity:.8}
.eyebrow .dot{margin:0 .6em;opacity:.6}
.cover h1{color:inherit;font-size:40px;line-height:1.12;margin-top:10px;letter-spacing:-.02em;max-width:18em}
.lead{font-size:18px;line-height:1.5;margin:14px 0 0;max-width:36em;opacity:.92}
.lead strong{color:inherit}
.cover-meta{padding:22px 56px;border-bottom:1px solid var(--line);background:#fafbfd}
.meta{display:flex;flex-wrap:wrap;gap:14px 44px;margin:0}
.meta div{min-width:90px}
.meta dt{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.meta dd{margin:2px 0 0;font-size:15px;font-weight:600;color:var(--ink)}

/* content */
.content{padding:40px 56px 48px}
.section-title{font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--primary-dark);display:flex;align-items:center;gap:12px;margin:0 0 18px}
.section-title::after{content:"";flex:1;height:1px;background:var(--line)}

.toc{list-style:none;margin:0 0 44px;padding:0;display:grid;gap:2px}
.toc a{display:flex;gap:14px;align-items:baseline;padding:8px 12px;border-radius:8px}
.toc a:hover{background:var(--tint)}
.toc-n{flex:none;width:26px;height:26px;border-radius:50%;display:inline-grid;place-items:center;font-size:12.5px;font-weight:700;color:var(--primary-dark);background:var(--tint);transform:translateY(-1px)}
.toc-t{color:var(--body)}

.step{padding:28px 0 34px;border-top:1px solid var(--line)}
.procedure .section-title + .step{border-top:0;padding-top:4px}
.step-head{display:flex;gap:18px;align-items:flex-start}
.badge{flex:none;width:40px;height:40px;border-radius:50%;background:var(--primary);color:var(--on-primary);display:grid;place-items:center;font-weight:700;font-size:16px;box-shadow:0 0 0 4px var(--tint)}
.step-text{flex:1;min-width:0}
.kicker{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);line-height:1.4}
.instr{font-size:20px;line-height:1.4;font-weight:500;color:var(--ink);margin-top:3px}
.instr strong{font-weight:700;color:var(--primary-dark)}
.desc{margin:8px 0 0;color:var(--body);max-width:44em}
.shot{margin:20px 0 0 58px}
.shot img{display:block;width:100%;height:auto;border-radius:10px;border:1px solid #d6dce6;box-shadow:0 1px 2px rgba(15,23,42,.05),0 8px 24px rgba(15,23,42,.08)}

.callout{border:1px solid color-mix(in srgb,var(--accent) 35%,transparent);border-left:5px solid var(--accent);background:var(--accent-tint);border-radius:10px;padding:16px 20px}
.callout-label{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink)}
.callout-icon{width:20px;height:20px;border-radius:50%;background:var(--accent);color:#fff;display:inline-grid;place-items:center;font:700 12px/1 Georgia,serif;text-transform:none}
.callout-kicker{margin-left:auto;color:var(--muted);font-weight:600}
.callout-title{margin-top:8px;font-size:17px;color:var(--ink)}
.callout p{margin:6px 0 0}
.note-step .shot{margin-left:0}

.doc-end{margin-top:12px;padding:28px 32px;border-radius:12px;background:var(--tint);text-align:center}
.done{display:inline-flex;align-items:center;gap:10px;font-size:18px;font-weight:700;color:var(--primary-dark)}
.check{width:28px;height:28px;border-radius:50%;background:var(--primary);color:var(--on-primary);display:inline-grid;place-items:center;font-size:15px}
.doc-end p{margin:6px 0 0}
.colophon{margin-top:16px;font-size:12px;color:var(--muted);letter-spacing:.02em}

@media (max-width:720px){
  .sheet{margin:0;border-radius:0}
  .cover-band{padding:24px 20px 32px}.cover-title{margin-top:36px}.cover h1{font-size:30px}.lead{font-size:16px}
  .cover-meta,.content{padding-left:20px;padding-right:20px}
  .meta{gap:12px 28px}
  .shot{margin-left:0}
  .instr{font-size:18px}
  .badge{width:34px;height:34px;font-size:14px}
}

/* print */
@page{size:A4;margin:22mm 16mm 20mm}
@media print{
  body{background:#fff;font-size:10.5pt}
  .sheet{max-width:none;margin:0;border-radius:0;box-shadow:none;overflow:visible}
  .cover{break-after:page}
  .toc a:hover{background:none}
  .step{break-inside:avoid;padding:14pt 0 16pt}
  .step-head{break-after:avoid}
  .shot{margin:12pt 0 0 0;text-align:center}
  .shot img{width:auto;max-width:100%;max-height:92mm;margin:0 auto;box-shadow:none}
  .instr{font-size:13.5pt}
  .kicker{font-size:8pt}
  .badge{width:28pt;height:28pt;font-size:12pt}
  .doc-end{break-inside:avoid}
  .section-title{break-after:avoid}
}
${
  print
    ? `
/* PDF cover: fills the first page inside the running header/footer */
body.print .cover{height:254mm;display:flex;flex-direction:column;border-radius:4mm;overflow:hidden;border:0.3mm solid var(--line)}
body.print .cover-band{flex:1;padding:14mm 14mm 16mm;display:flex;flex-direction:column}
body.print .cover-title{margin-top:auto;margin-bottom:4mm}
body.print .cover h1{font-size:32pt}
body.print .lead{font-size:13.5pt}
body.print .cover-meta{padding:9mm 14mm 10mm;background:#fff;border:0}
body.print .meta{display:grid;grid-template-columns:repeat(5,auto);justify-content:space-between;gap:6mm}
body.print .meta dd{white-space:nowrap}
body.print .content{padding:0}
`
    : ""
}`;
}

export async function generateHtml(ctx: GeneratorContext): Promise<GeneratedFile> {
  const html = await renderGuideHtml(ctx);
  return { buffer: Buffer.from(html, "utf8"), filename: outputFilename(ctx.process, "html"), mime: MIME.html };
}
