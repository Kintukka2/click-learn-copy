# Publishing the extension in the Chrome Web Store

The extension is published as an **unlisted** item: only people with the link can find and install it. Edge users install it from the same listing.

## 1. Before the first upload

On the server (`deploy/.env`, then `docker compose … up -d --build`):

- `STEPLIGHT_ACCESS_KEY` is set. Learners get guides only; **Record** and **Open Studio** appear only for someone who enters this key. A server without a key treats everyone as an author.
- `STEPLIGHT_PUBLISHER` and `STEPLIGHT_CONTACT_EMAIL` are set. Open `https://examplewebsite.app/steplight/privacy` and check the page. It no longer shows the yellow "has not set its publisher name" notice.

Read the privacy page through once. It describes what the extension does today. Change `src/server/privacy.ts` if your setup differs, for example if you turn on the AI features under a different provider.

## 2. Build the zip

```
npm install
npm run package:extension
```

This creates `dist/steplight-extension-<version>.zip`, with `manifest.json` at the root. Upload that file.

**Every update:**

1. Raise `"version"` in `extension/manifest.json`. The store rejects a version it already has.
2. Run `npm run package:extension`.
3. In the dashboard, open **Package → Upload new package**, then **Submit for review**.

Installed copies update automatically once the review passes, usually within a day.

Assist (the Guide me highlighting) ships inside the extension, because the store does not allow extensions to run code downloaded from a server. A fix to Assist therefore reaches extension users with the next extension version. The server's `/lib/assist.js` still serves the portal and pages that embed Assist.

## 3. The dashboard forms

### Package
Upload the zip.

### Store listing
| Field | What to enter |
|---|---|
| Name | Comes from the manifest: **Steplight** |
| Summary | Comes from the manifest description |
| Description | What learners get (guides for the page they're on, a count on the toolbar icon, Guide me), plus one line for authors (recording). Say that it needs your organisation's Steplight server. |
| Category | Productivity → Workflow & Planning |
| Language | English |
| Store icon | `extension/icons/icon128.png` |
| Screenshots | At least one, 1280×800 or 640×400. Good choices: the popup with "1 guide for this page", and Guide me highlighting a step. |
| Small promo tile | 440×280 |
| Official URL / Homepage | Your domain, e.g. `https://examplewebsite.app` |
| Support URL | Optional. A mailto link or a page on your domain. |

### Privacy practices
**Single purpose**

> Shows step-by-step guides from the user's organisation's Steplight server inside the web applications they use, and lets that organisation's guide authors record new guides.

**Permission justifications**

| Permission | Justification |
|---|---|
| `storage` | Saves the Steplight server address, the author's access key and small preferences on the device. |
| `tabs` | Reads the address of the current tab to find the guides for that page and show their number on the toolbar icon. |
| `activeTab` | Starts a guide or a recording in the tab the user is looking at. |
| `scripting` | Injects the guide overlay (bundled in the extension) that highlights the next step, and the recorder for authors. |
| `sidePanel` | Shows the help panel with all guides for the current page. |
| Host permission `<all_urls>` | Each organisation uses its own web applications at its own addresses (e.g. its Dynamics 365 tenant), so the guides and the recorder must work on any site. Page addresses are only sent to the user's own Steplight server, and only for sites that have guides. |

**Remote code:** choose **No, I am not using remote code**. All JavaScript is in the package. The server returns guide data as JSON only.

**Data usage.** Tick these:

- **Web history.** Addresses of pages on sites with guides are sent to the organisation's server.
- **User activity.** Clicks and keystrokes, only while an author records.
- **Website content.** Text and screenshots of recorded steps, only while an author records.
- **Authentication information.** The author's access key, sent to their own server.

Then tick all three certifications: not sold, not used for unrelated purposes, and not used for creditworthiness.

**Privacy policy URL:** `https://examplewebsite.app/steplight/privacy`. Update it when the domain changes.

### Distribution
- **Visibility:** Unlisted
- **Regions:** All regions, or only the ones your clients are in
- **Payments:** Free

### Test instructions
Reviewers need a working server to see the extension do anything. Give them:

- the server URL to enter under **Settings**
- a page with a guide: the demo app at `https://examplewebsite.app/steplight/demo-erp/`, after creating the sample project in the Studio

Don't give them the access key. The guide flow is what learners use.

### Account (one-time)
- **Trader declaration:** choose **Trader**. Enter your business name, address, phone and email, and verify them. The store shows them on the listing to users in the EU.
- **Contact email:** verify it in **Account**. Publishing is blocked until it is verified.

The `<all_urls>` host permission means a longer first review, typically a few days.

## 4. Giving it to users

Send users the listing link (**Package → View in Chrome Web Store** once published) and this:

1. **Chrome:** open the link and click **Add to Chrome**.
   **Edge:** open `edge://extensions`, turn on **Allow extensions from other stores**, then open the link and click **Add to Chrome**.
2. Click the Steplight icon (pin it from the puzzle-piece menu), open **Settings**, enter the server URL (e.g. `https://examplewebsite.app/steplight`) and click **Save**.

Authors also enter the access key in the same place.
