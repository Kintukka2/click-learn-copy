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

export async function customerPoolGuide(shots: { list: GuideImage; form: GuideImage } = { list: solidPng(120, 60, 220), form: solidPng(64, 32) }): Promise<Buffer> {
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
