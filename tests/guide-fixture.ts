// A written guide as teams have them in Word: "Create a customer pool" in D365 with a menu path, bold
// element names, a vague line and screenshots between the steps. Used by the import tests.
import { AlignmentType, Document, HeadingLevel, ImageRun, LevelFormat, Packer, Paragraph, TextRun } from "docx";
import { PNG } from "pngjs";

export interface GuideImage {
  type: "png" | "jpg";
  data: Buffer;
  width: number;
  height: number;
}

/** A plain PNG of one colour. */
export function solidPng(width: number, height: number, grey = 200): GuideImage {
  const png = new PNG({ width, height });
  png.data.fill(grey);
  return { type: "png", data: PNG.sync.write(png), width, height };
}

export async function customerPoolGuide(shots: { list: GuideImage; form: GuideImage } = { list: solidPng(400, 240, 220), form: solidPng(320, 200) }): Promise<Buffer> {
  const b = (t: string) => new TextRun({ text: t, bold: true });
  const t = (s: string) => new TextRun(s);
  const item = (...children: TextRun[]) => new Paragraph({ numbering: { reference: "steps", level: 0 }, children });
  const picture = (im: GuideImage) => new Paragraph({ children: [new ImageRun({ type: im.type, data: im.data, transformation: { width: Math.min(im.width, 600), height: Math.round((im.height * Math.min(im.width, 600)) / im.width) } })] });
  const doc = new Document({
    title: "Create a customer pool",
    numbering: { config: [{ reference: "steps", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START }] }] },
    sections: [
      {
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, children: [t("Customer pools")] }),
          new Paragraph({ children: [t("Customer pools group customers so collections work can be filtered by pool.")] }),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t("Steps")] }),
          item(t("Go to "), b("Accounts receivable > Setup > Customer pools"), t(".")),
          picture(shots.list),
          item(t("Click "), b("New"), t(". A new pool row opens.")),
          picture(shots.form),
          item(t("In the "), b("Pool ID"), t(" field, enter "), b("WHOLESALE"), t(".")),
          item(t("Enter a description in the "), b("Description"), t(" field.")),
          item(t("Select the "), b("Active"), t(" check box, then click "), b("Save"), t(".")),
          item(t("Make sure the details are correct before you continue.")),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

/**
 * A company template: a logo on the cover and again at the top of each part, a small icon in a
 * sentence, and one real screenshot in part 1.
 */
export async function brandedGuide(): Promise<Buffer> {
  const logo = solidPng(300, 90, 60);
  const icon = solidPng(24, 24, 120);
  const screen = solidPng(800, 450, 230);
  const b = (t: string) => new TextRun({ text: t, bold: true });
  const t = (s: string) => new TextRun(s);
  const pic = (im: GuideImage) => new ImageRun({ type: "png", data: im.data, transformation: { width: im.width, height: im.height } });
  const item = (...children: (TextRun | ImageRun)[]) => new Paragraph({ numbering: { reference: "steps", level: 0 }, children });
  const doc = new Document({
    numbering: { config: [{ reference: "steps", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START }] }] },
    sections: [
      {
        children: [
          new Paragraph({ children: [pic(logo)] }),
          new Paragraph({ heading: HeadingLevel.TITLE, children: [t("Daily General Journal")] }),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t("Part 1: Create the journal")] }),
          new Paragraph({ children: [pic(screen)] }),
          item(t("Click "), b("New"), t(".")),
          item(t("Click "), pic(icon), t(" "), b("Attach"), t(".")),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [t("Part 2: Post it")] }),
          new Paragraph({ children: [pic(logo)] }),
          item(t("Click "), b("Post"), t(".")),
          item(t("Click "), b("Close"), t(".")),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
