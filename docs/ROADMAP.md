# Roadmap

Planned enhancements that are not built yet, so they don't get lost.

## Setup and distribution

- **Connect link instead of typing the server URL.** Today every user enters the server URL once under Settings. Planned: a "Connect the extension" link on the portal or in an email (e.g. `https://<server>/connect`) that sets the server for them. For managed devices, the URL can also come from enterprise policy (`storage.managed`), so IT can pre-configure it.
- **Official domain.** Move from the test domain `examplewebsite.app` to the official one. The server URL, `STEPLIGHT_BASE_URL`, the Cloudflare tunnel/Worker and the store listing's privacy policy URL all change with it. Users need to re-enter the server URL, unless the connect link above exists by then.
- **One server per client.** Each client runs its own Steplight server with its own URL, and all of them use the same store extension. This is why the server URL is a setting rather than built in.
- **Dedicated server.** Steplight runs on an always-on PC today. Planned: a dedicated server or a cloud host, with backups of the `steplight-data` volume.
- **Microsoft Edge Add-ons listing.** Edge users install from the Chrome Web Store today, after "Allow extensions from other stores". A listing in Edge Add-ons removes that step.

## Guidance

- **"?" help button on the page.** A small button in the application itself that opens the guides for the page, for users who don't notice the toolbar badge.
- **Portal and email links that start Guide me in D365.** Links with `sl_assist` work when Assist is on the page. In D365 they should also start the guide through the extension.
- **Resume Guide me after a full page reload.** Assist resumes across in-page navigation. After a full reload, it needs the extension to inject it again and continue at the saved step.

## Recording

- **Import PDF guides.** Word (.docx) only today; a PDF guide would follow the same draft flow.

- **Record the state of expanders.** D365 menus have no `aria-expanded`. Assist learns which elements are toggles during playback; the recorder should store whether a group was open so the first run is right too.
- **Don't send values typed into sensitive fields.** Values typed into passwords and card numbers are marked as sensitive and hidden in published guides, but they are still sent to and stored on the server. Planned: drop the value in the recorder itself. Test Me would then accept any answer for those steps.
