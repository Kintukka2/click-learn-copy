import { useStudio } from "../lib/store";
import { Icon } from "./Icon";
import { Button, CopyButton, Dialog } from "./ui";
import { ROOT } from "../lib/base";

export function ExtensionHelp() {
  const { helpOpen, setHelpOpen } = useStudio();
  const origin = window.location.origin + ROOT;
  const steps: { title: string; body: JSX.Element }[] = [
    {
      title: "Build the extension",
      body: (
        <>
          From the Steplight repository run the full build. It bundles the extension into <code>dist/extension</code>.
          <CodeLine text="npm run build" />
        </>
      ),
    },
    {
      title: "Load it unpacked",
      body: (
        <>
          Open <code>chrome://extensions</code> (or <code>edge://extensions</code>), switch on <strong>Developer mode</strong>, click <strong>Load unpacked</strong> and select the <code>dist/extension</code> folder.
          <CodeLine text="chrome://extensions" />
        </>
      ),
    },
    {
      title: "Connect it to this server",
      body: (
        <>
          Pin Steplight, open its side panel and set the server URL to:
          <CodeLine text={origin} />
        </>
      ),
    },
    {
      title: "Record a process",
      body: (
        <>
          In Studio open a process and choose <strong>Record → Start recording session</strong>. The extension picks up the active session and streams every click,
          entry and screenshot into the process as you work.
        </>
      ),
    },
  ];
  return (
    <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} title="Get the browser extension" description="Record in any web application and run Assist guidance on top of it." icon="puzzle" width={560} footer={<Button variant="primary" onClick={() => setHelpOpen(false)}>Done</Button>}>
      <ol className="help-steps">
        {steps.map((s, i) => (
          <li key={s.title}>
            <span className="help-num">{i + 1}</span>
            <div>
              <div className="help-title">{s.title}</div>
              <div className="help-body">{s.body}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="callout callout-teal">
        <Icon name="info" size={16} />
        <div>
          No extension handy? Use <strong>Record → Demo scenario</strong> in any process: Steplight drives the bundled Northwind ERP in a headless browser and records it for you.
        </div>
      </div>
    </Dialog>
  );
}

export function CodeLine({ text }: { text: string }) {
  return (
    <div className="code-line">
      <code>{text}</code>
      <CopyButton text={text} />
    </div>
  );
}
