// esbuild bundles .css imports as text (see scripts/build-lib.mjs): `import css from "./x.css"` gives a string.
declare module "*.css" {
  const content: string;
  export default content;
}
