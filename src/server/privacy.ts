// Privacy policy of the Steplight browser extension, served at <base>/privacy (public, no access key)
// so a store listing can link to it. Publisher and contact come from STEPLIGHT_PUBLISHER and
// STEPLIGHT_CONTACT_EMAIL; the text describes what the extension in extension/ actually sends.

export const PRIVACY_UPDATED = "19 October 2026";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c as "&"]);

export function privacyPage(opts: { publisher?: string; contactEmail?: string }): string {
  const publisher = opts.publisher?.trim();
  const email = opts.contactEmail?.trim();
  const who = publisher ? esc(publisher) : "the publisher of the Steplight extension";
  const missing = !publisher || !email;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Steplight privacy policy</title>
<style>
  :root { color-scheme: light dark; --fg: #1d2330; --muted: #5b6475; --bg: #fff; --line: #e3e7ee; --warn: #fff4d6; }
  @media (prefers-color-scheme: dark) { :root { --fg: #e6e9ef; --muted: #a3abba; --bg: #14171d; --line: #2a303b; --warn: #3a3214; } }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  h2 { font-size: 19px; margin: 32px 0 8px; }
  .muted { color: var(--muted); }
  .warn { background: var(--warn); border: 1px solid var(--line); border-radius: 8px; padding: 10px 14px; }
  li { margin: 6px 0; }
</style>
</head>
<body>
<main>
<h1>Steplight privacy policy</h1>
<p class="muted">Last updated ${PRIVACY_UPDATED}</p>
${missing ? `<p class="warn">The operator of this server has not set its publisher name and contact address yet (STEPLIGHT_PUBLISHER and STEPLIGHT_CONTACT_EMAIL).</p>` : ""}

<p>This policy covers the Steplight browser extension, published by ${who}. Steplight shows step-by-step guides inside the
web applications your organisation uses, and lets your organisation's guide authors record new ones.</p>

<h2>Where your data goes</h2>
<p>The extension talks to one place only: the Steplight server whose address you enter in its settings. That server is run by
your organisation (or by a provider on its behalf). The extension does not send data to the publisher, to advertisers or to
any analytics service. Nothing is sold, and nothing is used for advertising or to decide creditworthiness.</p>

<h2>What the extension stores on your device</h2>
<ul>
  <li>The address of your Steplight server and, for authors, its access key.</li>
  <li>Small preferences, such as your guide language and which sections of the extension are open.</li>
</ul>
<p>These stay in your browser and are removed when you uninstall the extension.</p>

<h2>What the extension sends to your Steplight server</h2>
<ul>
  <li><strong>The list of applications with guides.</strong> The extension asks your server which web sites have guides. It
    sends no page information for this.</li>
  <li><strong>Addresses of pages in those applications.</strong> When you open a page on one of those sites, the extension sends
    its address to your server to find the guides for that page and show their number on the toolbar icon. Addresses of
    pages on other sites are not sent while you browse; they are only sent when you open the extension's popup or help
    panel on such a page yourself, to look for guides there.</li>
  <li><strong>Guide use.</strong> When you start or finish a guide, the extension tells your server which guide it was and in
    which language, so your organisation can see which guides are used. This does not include your name or account.</li>
  <li><strong>Recordings (authors only).</strong> Only while an author records a guide, the extension sends the clicks, typed
    text and selected options in that tab, the page addresses, and a screenshot of each step. They are stored on your
    server as part of the guide. Fields such as passwords and card numbers are marked as sensitive and their values are
    not shown in published guides; authors should record with test data rather than real credentials.</li>
</ul>

<h2>What your organisation's server may do with it</h2>
<p>Your server keeps guides, recordings and usage counts until your organisation deletes them. If your organisation turns on
the optional AI features, the text of guides and questions asked in the help portal may be sent to Anthropic to write help
answers and translations, under your organisation's agreement with Anthropic. Your organisation decides who can see this data;
ask it about its own privacy practices.</p>

<h2>Permissions</h2>
<p>The extension needs access to the sites you visit so it can show guides in any web application your organisation uses and,
for authors, record steps there. It only reads pages to highlight the next step of a guide you started, or while an author
records.</p>

<h2>Contact</h2>
<p>${email ? `Questions about this policy: <a href="mailto:${esc(email)}">${esc(email)}</a>.` : "Questions about this policy: contact the publisher through the extension's store listing."}
For questions about the data on your organisation's server, contact your organisation.</p>
</main>
</body>
</html>`;
}
