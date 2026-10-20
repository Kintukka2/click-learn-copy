// Turns captured actions into human instructions ("Click **Save**.") in several languages.
// Pure functions, browser-safe.
import type { ActionType, Lang, Step, Target } from "./model.js";

export const SUPPORTED_LANGS: { code: Lang; name: string; native: string }[] = [
  { code: "en", name: "English", native: "English" },
  { code: "da", name: "Danish", native: "Dansk" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "fr", name: "French", native: "Français" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "nl", name: "Dutch", native: "Nederlands" },
  { code: "sv", name: "Swedish", native: "Svenska" },
];

type Kind =
  | "clickButton"
  | "clickLink"
  | "clickTab"
  | "clickMenu"
  | "clickField"
  | "clickGeneric"
  | "clickRow"
  | "clickRowAny"
  | "type"
  | "typeSecret"
  | "typeOwn"
  | "select"
  | "check"
  | "uncheck"
  | "press"
  | "navigate"
  | "note";

// {n} = element name, {v} = value, {c} = column header (a step where the learner picks a row)
const T: Record<Lang, Record<Kind, string>> = {
  en: {
    clickButton: "Click **{n}**.",
    clickLink: "Click the **{n}** link.",
    clickTab: "Select the **{n}** tab.",
    clickMenu: "Choose **{n}** from the menu.",
    clickField: "Click the **{n}** field.",
    clickGeneric: "Click **{n}**.",
    clickRow: "In the **{c}** column, click the record you need.",
    clickRowAny: "Click the record you need in the list.",
    type: "In the **{n}** field, enter **{v}**.",
    typeSecret: "In the **{n}** field, enter your {n}.",
    typeOwn: "In the **{n}** field, enter the value you need.",
    select: "In **{n}**, select **{v}**.",
    check: "Select the **{n}** check box.",
    uncheck: "Clear the **{n}** check box.",
    press: "Press **{v}**.",
    navigate: "Open **{v}**.",
    note: "{v}",
  },
  da: {
    clickButton: "Klik på **{n}**.",
    clickLink: "Klik på linket **{n}**.",
    clickTab: "Vælg fanen **{n}**.",
    clickMenu: "Vælg **{n}** i menuen.",
    clickField: "Klik i feltet **{n}**.",
    clickGeneric: "Klik på **{n}**.",
    clickRow: "Klik på den post, du skal bruge, i kolonnen **{c}**.",
    clickRowAny: "Klik på den post, du skal bruge, på listen.",
    type: "Indtast **{v}** i feltet **{n}**.",
    typeSecret: "Indtast din {n} i feltet **{n}**.",
    typeOwn: "Indtast den værdi, du skal bruge, i feltet **{n}**.",
    select: "Vælg **{v}** i **{n}**.",
    check: "Markér afkrydsningsfeltet **{n}**.",
    uncheck: "Fjern markeringen i afkrydsningsfeltet **{n}**.",
    press: "Tryk på **{v}**.",
    navigate: "Åbn **{v}**.",
    note: "{v}",
  },
  de: {
    clickButton: "Klicken Sie auf **{n}**.",
    clickLink: "Klicken Sie auf den Link **{n}**.",
    clickTab: "Wählen Sie die Registerkarte **{n}**.",
    clickMenu: "Wählen Sie im Menü **{n}**.",
    clickField: "Klicken Sie in das Feld **{n}**.",
    clickGeneric: "Klicken Sie auf **{n}**.",
    clickRow: "Klicken Sie in der Spalte **{c}** auf den gewünschten Datensatz.",
    clickRowAny: "Klicken Sie in der Liste auf den gewünschten Datensatz.",
    type: "Geben Sie im Feld **{n}** **{v}** ein.",
    typeSecret: "Geben Sie im Feld **{n}** Ihr(e) {n} ein.",
    typeOwn: "Geben Sie im Feld **{n}** den benötigten Wert ein.",
    select: "Wählen Sie unter **{n}** **{v}** aus.",
    check: "Aktivieren Sie das Kontrollkästchen **{n}**.",
    uncheck: "Deaktivieren Sie das Kontrollkästchen **{n}**.",
    press: "Drücken Sie **{v}**.",
    navigate: "Öffnen Sie **{v}**.",
    note: "{v}",
  },
  fr: {
    clickButton: "Cliquez sur **{n}**.",
    clickLink: "Cliquez sur le lien **{n}**.",
    clickTab: "Sélectionnez l’onglet **{n}**.",
    clickMenu: "Choisissez **{n}** dans le menu.",
    clickField: "Cliquez dans le champ **{n}**.",
    clickGeneric: "Cliquez sur **{n}**.",
    clickRow: "Dans la colonne **{c}**, cliquez sur l’enregistrement souhaité.",
    clickRowAny: "Dans la liste, cliquez sur l’enregistrement souhaité.",
    type: "Dans le champ **{n}**, saisissez **{v}**.",
    typeSecret: "Dans le champ **{n}**, saisissez votre {n}.",
    typeOwn: "Dans le champ **{n}**, saisissez la valeur dont vous avez besoin.",
    select: "Dans **{n}**, sélectionnez **{v}**.",
    check: "Cochez la case **{n}**.",
    uncheck: "Décochez la case **{n}**.",
    press: "Appuyez sur **{v}**.",
    navigate: "Ouvrez **{v}**.",
    note: "{v}",
  },
  es: {
    clickButton: "Haga clic en **{n}**.",
    clickLink: "Haga clic en el enlace **{n}**.",
    clickTab: "Seleccione la pestaña **{n}**.",
    clickMenu: "Elija **{n}** en el menú.",
    clickField: "Haga clic en el campo **{n}**.",
    clickGeneric: "Haga clic en **{n}**.",
    clickRow: "En la columna **{c}**, haga clic en el registro que necesite.",
    clickRowAny: "En la lista, haga clic en el registro que necesite.",
    type: "En el campo **{n}**, escriba **{v}**.",
    typeSecret: "En el campo **{n}**, escriba su {n}.",
    typeOwn: "En el campo **{n}**, escriba el valor que necesite.",
    select: "En **{n}**, seleccione **{v}**.",
    check: "Active la casilla **{n}**.",
    uncheck: "Desactive la casilla **{n}**.",
    press: "Pulse **{v}**.",
    navigate: "Abra **{v}**.",
    note: "{v}",
  },
  nl: {
    clickButton: "Klik op **{n}**.",
    clickLink: "Klik op de koppeling **{n}**.",
    clickTab: "Selecteer het tabblad **{n}**.",
    clickMenu: "Kies **{n}** in het menu.",
    clickField: "Klik in het veld **{n}**.",
    clickGeneric: "Klik op **{n}**.",
    clickRow: "Klik in de kolom **{c}** op het record dat u nodig hebt.",
    clickRowAny: "Klik in de lijst op het record dat u nodig hebt.",
    type: "Voer in het veld **{n}** **{v}** in.",
    typeSecret: "Voer in het veld **{n}** uw {n} in.",
    typeOwn: "Voer in het veld **{n}** de waarde in die u nodig hebt.",
    select: "Selecteer in **{n}** **{v}**.",
    check: "Schakel het selectievakje **{n}** in.",
    uncheck: "Schakel het selectievakje **{n}** uit.",
    press: "Druk op **{v}**.",
    navigate: "Open **{v}**.",
    note: "{v}",
  },
  sv: {
    clickButton: "Klicka på **{n}**.",
    clickLink: "Klicka på länken **{n}**.",
    clickTab: "Välj fliken **{n}**.",
    clickMenu: "Välj **{n}** i menyn.",
    clickField: "Klicka i fältet **{n}**.",
    clickGeneric: "Klicka på **{n}**.",
    clickRow: "Klicka på den post du behöver i kolumnen **{c}**.",
    clickRowAny: "Klicka på den post du behöver i listan.",
    type: "Ange **{v}** i fältet **{n}**.",
    typeSecret: "Ange ditt {n} i fältet **{n}**.",
    typeOwn: "Ange det värde du behöver i fältet **{n}**.",
    select: "Välj **{v}** i **{n}**.",
    check: "Markera kryssrutan **{n}**.",
    uncheck: "Avmarkera kryssrutan **{n}**.",
    press: "Tryck på **{v}**.",
    navigate: "Öppna **{v}**.",
    note: "{v}",
  },
};

/** UI strings used by players, portal and generators. */
const UI: Record<Lang, Record<string, string>> = {
  en: { step: "Step", of: "of", showMe: "Show me", tryMe: "Try it", testMe: "Test me", guideMe: "Guide me in the app", written: "Written guide", downloads: "Downloads", next: "Next", back: "Back", restart: "Restart", hint: "Hint", wrongClick: "Not quite. Look for the highlighted area.", passed: "Passed", failed: "Not passed", score: "Score", search: "Search processes…", ask: "Ask a question", contents: "Contents", processes: "processes", steps: "steps", done: "Well done! You completed the process.", typeHere: "Type here and press Enter", play: "Play", pause: "Pause", language: "Language", languages: "languages", updated: "Updated", allProcesses: "All processes", noResults: "No matching processes.", askPlaceholder: "How do I…?", sources: "Based on", openProcess: "Open process" },
  da: { step: "Trin", of: "af", showMe: "Vis mig", tryMe: "Prøv selv", testMe: "Test mig", guideMe: "Guid mig i programmet", written: "Skriftlig vejledning", downloads: "Downloads", next: "Næste", back: "Tilbage", restart: "Start forfra", hint: "Tip", wrongClick: "Ikke helt. Se efter det fremhævede område.", passed: "Bestået", failed: "Ikke bestået", score: "Score", search: "Søg i processer…", ask: "Stil et spørgsmål", contents: "Indhold", processes: "processer", steps: "trin", done: "Godt gået! Du har gennemført processen.", typeHere: "Skriv her og tryk Enter", play: "Afspil", pause: "Pause", language: "Sprog", languages: "sprog", updated: "Opdateret", allProcesses: "Alle processer", noResults: "Ingen matchende processer.", askPlaceholder: "Hvordan gør jeg…?", sources: "Baseret på", openProcess: "Åbn proces" },
  de: { step: "Schritt", of: "von", showMe: "Zeig es mir", tryMe: "Ausprobieren", testMe: "Teste mich", guideMe: "In der Anwendung führen", written: "Schriftliche Anleitung", downloads: "Downloads", next: "Weiter", back: "Zurück", restart: "Neu starten", hint: "Hinweis", wrongClick: "Nicht ganz. Achten Sie auf den markierten Bereich.", passed: "Bestanden", failed: "Nicht bestanden", score: "Punktzahl", search: "Prozesse durchsuchen…", ask: "Frage stellen", contents: "Inhalt", processes: "Prozesse", steps: "Schritte", done: "Gut gemacht! Sie haben den Prozess abgeschlossen.", typeHere: "Hier eingeben und Enter drücken", play: "Abspielen", pause: "Pause", language: "Sprache", languages: "Sprachen", updated: "Aktualisiert", allProcesses: "Alle Prozesse", noResults: "Keine passenden Prozesse.", askPlaceholder: "Wie kann ich…?", sources: "Basierend auf", openProcess: "Prozess öffnen" },
  fr: { step: "Étape", of: "sur", showMe: "Montrez-moi", tryMe: "Essayer", testMe: "Évaluez-moi", guideMe: "Me guider dans l’application", written: "Guide écrit", downloads: "Téléchargements", next: "Suivant", back: "Retour", restart: "Recommencer", hint: "Indice", wrongClick: "Pas tout à fait. Repérez la zone en surbrillance.", passed: "Réussi", failed: "Non réussi", score: "Score", search: "Rechercher des processus…", ask: "Poser une question", contents: "Sommaire", processes: "processus", steps: "étapes", done: "Bravo ! Vous avez terminé le processus.", typeHere: "Saisissez ici puis Entrée", play: "Lire", pause: "Pause", language: "Langue", languages: "langues", updated: "Mis à jour", allProcesses: "Tous les processus", noResults: "Aucun processus correspondant.", askPlaceholder: "Comment faire pour…?", sources: "D’après", openProcess: "Ouvrir le processus" },
  es: { step: "Paso", of: "de", showMe: "Muéstrame", tryMe: "Pruébalo", testMe: "Evalúame", guideMe: "Guíame en la aplicación", written: "Guía escrita", downloads: "Descargas", next: "Siguiente", back: "Atrás", restart: "Reiniciar", hint: "Pista", wrongClick: "No exactamente. Busque la zona resaltada.", passed: "Aprobado", failed: "No aprobado", score: "Puntuación", search: "Buscar procesos…", ask: "Hacer una pregunta", contents: "Contenido", processes: "procesos", steps: "pasos", done: "¡Bien hecho! Ha completado el proceso.", typeHere: "Escriba aquí y pulse Intro", play: "Reproducir", pause: "Pausa", language: "Idioma", languages: "idiomas", updated: "Actualizado", allProcesses: "Todos los procesos", noResults: "No hay procesos coincidentes.", askPlaceholder: "¿Cómo puedo…?", sources: "Basado en", openProcess: "Abrir proceso" },
  nl: { step: "Stap", of: "van", showMe: "Laat zien", tryMe: "Probeer het", testMe: "Test mij", guideMe: "Begeleid mij in de app", written: "Schriftelijke handleiding", downloads: "Downloads", next: "Volgende", back: "Terug", restart: "Opnieuw", hint: "Hint", wrongClick: "Niet helemaal. Zoek het gemarkeerde gebied.", passed: "Geslaagd", failed: "Niet geslaagd", score: "Score", search: "Processen zoeken…", ask: "Stel een vraag", contents: "Inhoud", processes: "processen", steps: "stappen", done: "Goed gedaan! U hebt het proces voltooid.", typeHere: "Typ hier en druk op Enter", play: "Afspelen", pause: "Pauze", language: "Taal", languages: "talen", updated: "Bijgewerkt", allProcesses: "Alle processen", noResults: "Geen overeenkomende processen.", askPlaceholder: "Hoe kan ik…?", sources: "Gebaseerd op", openProcess: "Proces openen" },
  sv: { step: "Steg", of: "av", showMe: "Visa mig", tryMe: "Prova själv", testMe: "Testa mig", guideMe: "Guida mig i appen", written: "Skriftlig guide", downloads: "Nedladdningar", next: "Nästa", back: "Tillbaka", restart: "Börja om", hint: "Tips", wrongClick: "Inte riktigt. Leta efter det markerade området.", passed: "Godkänd", failed: "Inte godkänd", score: "Poäng", search: "Sök processer…", ask: "Ställ en fråga", contents: "Innehåll", processes: "processer", steps: "steg", done: "Bra jobbat! Du har slutfört processen.", typeHere: "Skriv här och tryck Enter", play: "Spela", pause: "Paus", language: "Språk", languages: "språk", updated: "Uppdaterad", allProcesses: "Alla processer", noResults: "Inga matchande processer.", askPlaceholder: "Hur gör jag…?", sources: "Baserat på", openProcess: "Öppna process" },
};

export function ui(lang: Lang, key: string): string {
  return (UI[lang] ?? UI.en)[key] ?? UI.en[key] ?? key;
}

export function uiStrings(lang: Lang): Record<string, string> {
  return { ...UI.en, ...(UI[lang] ?? {}) };
}

function kindFor(action: ActionType, target: Target | undefined, value: string | undefined, sensitive?: boolean, chooses?: boolean): Kind {
  switch (action) {
    case "type":
      return sensitive ? "typeSecret" : chooses ? "typeOwn" : "type";
    case "select":
      return "select";
    case "check":
      return value === "false" ? "uncheck" : "check";
    case "press":
      return "press";
    case "navigate":
      return "navigate";
    case "note":
      return "note";
    case "click": {
      if (chooses && target?.row) return clean(target.row.column) ? "clickRow" : "clickRowAny";
      const role = target?.role ?? "";
      const tag = target?.tag ?? "";
      if (role === "tab") return "clickTab";
      if (role === "menuitem" || role === "option") return "clickMenu";
      if (role === "link" || tag === "a") return "clickLink";
      if (role === "button" || tag === "button") return "clickButton";
      if (role === "textbox" || role === "combobox" || tag === "input" || tag === "textarea") return "clickField";
      return "clickGeneric";
    }
  }
}

function clean(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").replace(/\*\*/g, "").trim();
}

export interface InstructionInput {
  action: ActionType;
  target?: Target;
  value?: string;
  sensitive?: boolean;
  /** The learner picks the value or row (Step.learnerChooses). */
  learnerChooses?: boolean;
  /** Override names (e.g. localized label from a localized replay). */
  name?: string;
}

/** Generate the instruction text for a step in a language. */
export function instructionFor(input: InstructionInput, lang: Lang = "en"): string {
  const table = T[lang] ?? T.en;
  const kind = kindFor(input.action, input.target, input.value, input.sensitive, input.learnerChooses);
  let n = clean(input.name ?? input.target?.label ?? input.target?.name);
  if (!n) n = kindFallbackName(input, lang);
  let v = clean(input.value);
  if (input.action === "press" && !v) v = "Enter";
  if (input.sensitive) v = "••••••";
  const tpl = table[kind];
  // "typeSecret" uses the name as a lower-case noun in running text after the bold one.
  return tpl
    .replace("{n}", n)
    .replace("{n}", kind === "typeSecret" ? n.toLowerCase() : n)
    .replace("{v}", v)
    .replace("{c}", clean(input.target?.row?.column))
    .replace(/([.!?])(\*\*)?\.$/, "$1$2"); // "Ext. Doc. No.**." → no double full stop
}

function kindFallbackName(input: InstructionInput, lang: Lang): string {
  const fallback: Record<Lang, string> = { en: "the highlighted element", da: "det fremhævede element", de: "das markierte Element", fr: "l’élément en surbrillance", es: "el elemento resaltado", nl: "het gemarkeerde element", sv: "det markerade elementet" };
  return fallback[lang] ?? fallback.en;
}

/** Instruction for an existing step in its source language. */
export function instructionForStep(step: Step, lang: Lang = "en"): string {
  return instructionFor({ action: step.action, target: step.target, value: step.value, sensitive: step.sensitive, learnerChooses: step.learnerChooses }, lang);
}

/** Minimal, safe **bold** → <strong> conversion with HTML escaping. Newlines become <br>. */
export function richText(s: string | undefined): string {
  const esc = (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return esc.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
}

/** Split "**bold** text" into runs for docx/pptx generators. */
export function textRuns(s: string | undefined): { text: string; bold: boolean }[] {
  const out: { text: string; bold: boolean }[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  const src = s ?? "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ text: src.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ text: src.slice(last), bold: false });
  return out.filter((r) => r.text.length > 0);
}

export function plainText(s: string | undefined): string {
  return (s ?? "").replace(/\*\*(.+?)\*\*/g, "$1");
}
