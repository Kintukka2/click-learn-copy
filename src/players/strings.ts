// UI strings for the player and Assist: the shared core strings (uiStrings) plus a few
// player-specific ones that the core dictionary does not carry. `{p}`, `{k}`, `{v}`, `{c}`, `{t}`
// are placeholders filled with fill().
import { uiStrings } from "../core/instructions.js";

const EXTRA: Record<string, Record<string, string>> = {
  en: {
    optOther: "Other", optNone: "None",
    start: "Start", prev: "Previous", speed: "Speed", narration: "Narration", fullscreen: "Full screen",
    mistakes: "Mistakes", correct: "Correct", incorrect: "Incorrect", review: "Review", passMark: "Pass mark",
    continue: "Continue", pressKey: "Press {k}", expected: "Hint: enter {v}", expectedOption: "Hint: choose {v}",
    wrongValue: "That’s not quite right. Check the value and try again.", answerShown: "Not correct. The right answer is shown.",
    wellDone: "Correct!", chooseOption: "Choose an option", introShow: "Watch a step-by-step demonstration.",
    introTry: "Practise each step yourself. Hints help you along the way.", introTest: "Complete each step without help. You need {p}% to pass.",
    watchAgain: "Watch again", tryAgain: "Try again", youScored: "Your score", correctSteps: "{c} of {t} steps correct",
    skip: "Skip", exit: "Exit", finding: "Looking for this element on the page…", goToPage: "Go to the page", close: "Close",
    seeThrough: "See through the card", notFound: "Can’t find this element yet. Open the right page, or skip this step.", assistDone: "You completed the process.",
    stepsLabel: "Steps", narrationOn: "Narration on", narrationOff: "Narration off", demo: "Demo", practice: "Practice", assessment: "Assessment",
  },
  da: {
    optOther: "Andet", optNone: "Ingen",
    start: "Start", prev: "Forrige", speed: "Hastighed", narration: "Speak", fullscreen: "Fuld skærm",
    mistakes: "Fejl", correct: "Rigtigt", incorrect: "Forkert", review: "Gennemgang", passMark: "Beståelseskrav",
    continue: "Fortsæt", pressKey: "Tryk på {k}", expected: "Tip: indtast {v}", expectedOption: "Tip: vælg {v}",
    wrongValue: "Ikke helt rigtigt. Tjek værdien, og prøv igen.", answerShown: "Forkert. Det rigtige svar vises.",
    wellDone: "Rigtigt!", chooseOption: "Vælg en mulighed", introShow: "Se en trin-for-trin-demonstration.",
    introTry: "Øv hvert trin selv. Tips hjælper dig undervejs.", introTest: "Gennemfør hvert trin uden hjælp. Du skal have {p} % for at bestå.",
    watchAgain: "Se igen", tryAgain: "Prøv igen", youScored: "Din score", correctSteps: "{c} af {t} trin rigtige",
    skip: "Spring over", exit: "Afslut", finding: "Leder efter elementet på siden…", goToPage: "Gå til siden", close: "Luk",
    seeThrough: "Se gennem kortet", notFound: "Elementet blev ikke fundet endnu. Åbn den rigtige side, eller spring trinnet over.", assistDone: "Du har gennemført processen.",
    stepsLabel: "Trin", narrationOn: "Speak til", narrationOff: "Speak fra", demo: "Demo", practice: "Øvelse", assessment: "Test",
  },
  de: {
    optOther: "Sonstige", optNone: "Keine",
    start: "Starten", prev: "Zurück", speed: "Tempo", narration: "Sprecher", fullscreen: "Vollbild",
    mistakes: "Fehler", correct: "Richtig", incorrect: "Falsch", review: "Auswertung", passMark: "Bestehensgrenze",
    continue: "Weiter", pressKey: "Drücken Sie {k}", expected: "Hinweis: Geben Sie {v} ein", expectedOption: "Hinweis: Wählen Sie {v}",
    wrongValue: "Nicht ganz richtig. Prüfen Sie den Wert und versuchen Sie es erneut.", answerShown: "Falsch. Die richtige Antwort wird angezeigt.",
    wellDone: "Richtig!", chooseOption: "Option auswählen", introShow: "Sehen Sie sich eine Schritt-für-Schritt-Vorführung an.",
    introTry: "Üben Sie jeden Schritt selbst. Hinweise helfen Ihnen dabei.", introTest: "Führen Sie jeden Schritt ohne Hilfe aus. Zum Bestehen benötigen Sie {p} %.",
    watchAgain: "Erneut ansehen", tryAgain: "Erneut versuchen", youScored: "Ihre Punktzahl", correctSteps: "{c} von {t} Schritten richtig",
    skip: "Überspringen", exit: "Beenden", finding: "Element wird auf der Seite gesucht…", goToPage: "Zur Seite wechseln", close: "Schließen",
    seeThrough: "Durch die Karte sehen", notFound: "Das Element wurde noch nicht gefunden. Öffnen Sie die richtige Seite oder überspringen Sie den Schritt.", assistDone: "Sie haben den Prozess abgeschlossen.",
    stepsLabel: "Schritte", narrationOn: "Sprecher an", narrationOff: "Sprecher aus", demo: "Demo", practice: "Übung", assessment: "Test",
  },
  fr: {
    optOther: "Autre", optNone: "Aucun",
    start: "Commencer", prev: "Précédent", speed: "Vitesse", narration: "Narration", fullscreen: "Plein écran",
    mistakes: "Erreurs", correct: "Correct", incorrect: "Incorrect", review: "Récapitulatif", passMark: "Seuil de réussite",
    continue: "Continuer", pressKey: "Appuyez sur {k}", expected: "Indice : saisissez {v}", expectedOption: "Indice : choisissez {v}",
    wrongValue: "Pas tout à fait. Vérifiez la valeur et réessayez.", answerShown: "Incorrect. La bonne réponse est affichée.",
    wellDone: "Correct !", chooseOption: "Choisissez une option", introShow: "Regardez une démonstration étape par étape.",
    introTry: "Entraînez-vous à chaque étape. Des indices vous aident.", introTest: "Réalisez chaque étape sans aide. Il faut {p} % pour réussir.",
    watchAgain: "Revoir", tryAgain: "Réessayer", youScored: "Votre score", correctSteps: "{c} étapes correctes sur {t}",
    skip: "Passer", exit: "Quitter", finding: "Recherche de l’élément sur la page…", goToPage: "Aller à la page", close: "Fermer",
    seeThrough: "Voir à travers la carte", notFound: "Élément introuvable pour l’instant. Ouvrez la bonne page ou passez cette étape.", assistDone: "Vous avez terminé le processus.",
    stepsLabel: "Étapes", narrationOn: "Narration activée", narrationOff: "Narration désactivée", demo: "Démo", practice: "Exercice", assessment: "Évaluation",
  },
  es: {
    optOther: "Otro", optNone: "Ninguno",
    start: "Empezar", prev: "Anterior", speed: "Velocidad", narration: "Narración", fullscreen: "Pantalla completa",
    mistakes: "Errores", correct: "Correcto", incorrect: "Incorrecto", review: "Revisión", passMark: "Nota mínima",
    continue: "Continuar", pressKey: "Pulse {k}", expected: "Pista: escriba {v}", expectedOption: "Pista: elija {v}",
    wrongValue: "No es correcto. Revise el valor e inténtelo de nuevo.", answerShown: "Incorrecto. Se muestra la respuesta correcta.",
    wellDone: "¡Correcto!", chooseOption: "Elija una opción", introShow: "Vea una demostración paso a paso.",
    introTry: "Practique cada paso. Las pistas le ayudan.", introTest: "Complete cada paso sin ayuda. Necesita un {p} % para aprobar.",
    watchAgain: "Ver de nuevo", tryAgain: "Intentar de nuevo", youScored: "Su puntuación", correctSteps: "{c} de {t} pasos correctos",
    skip: "Omitir", exit: "Salir", finding: "Buscando el elemento en la página…", goToPage: "Ir a la página", close: "Cerrar",
    seeThrough: "Ver a través de la tarjeta", notFound: "Aún no se encuentra el elemento. Abra la página correcta u omita este paso.", assistDone: "Ha completado el proceso.",
    stepsLabel: "Pasos", narrationOn: "Narración activada", narrationOff: "Narración desactivada", demo: "Demo", practice: "Práctica", assessment: "Evaluación",
  },
  nl: {
    optOther: "Overig", optNone: "Geen",
    start: "Starten", prev: "Vorige", speed: "Snelheid", narration: "Gesproken tekst", fullscreen: "Volledig scherm",
    mistakes: "Fouten", correct: "Goed", incorrect: "Fout", review: "Overzicht", passMark: "Slaaggrens",
    continue: "Doorgaan", pressKey: "Druk op {k}", expected: "Hint: voer {v} in", expectedOption: "Hint: kies {v}",
    wrongValue: "Niet helemaal goed. Controleer de waarde en probeer het opnieuw.", answerShown: "Fout. Het juiste antwoord wordt getoond.",
    wellDone: "Goed!", chooseOption: "Kies een optie", introShow: "Bekijk een stapsgewijze demonstratie.",
    introTry: "Oefen elke stap zelf. Hints helpen u op weg.", introTest: "Voer elke stap uit zonder hulp. U hebt {p}% nodig om te slagen.",
    watchAgain: "Opnieuw bekijken", tryAgain: "Opnieuw proberen", youScored: "Uw score", correctSteps: "{c} van {t} stappen goed",
    skip: "Overslaan", exit: "Afsluiten", finding: "Element op de pagina zoeken…", goToPage: "Naar de pagina", close: "Sluiten",
    seeThrough: "Door de kaart heen kijken", notFound: "Element nog niet gevonden. Open de juiste pagina of sla deze stap over.", assistDone: "U hebt het proces voltooid.",
    stepsLabel: "Stappen", narrationOn: "Gesproken tekst aan", narrationOff: "Gesproken tekst uit", demo: "Demo", practice: "Oefening", assessment: "Toets",
  },
  sv: {
    optOther: "Annat", optNone: "Inget",
    start: "Starta", prev: "Föregående", speed: "Hastighet", narration: "Uppläsning", fullscreen: "Helskärm",
    mistakes: "Fel", correct: "Rätt", incorrect: "Fel", review: "Genomgång", passMark: "Godkäntgräns",
    continue: "Fortsätt", pressKey: "Tryck på {k}", expected: "Tips: ange {v}", expectedOption: "Tips: välj {v}",
    wrongValue: "Inte riktigt. Kontrollera värdet och försök igen.", answerShown: "Fel. Rätt svar visas.",
    wellDone: "Rätt!", chooseOption: "Välj ett alternativ", introShow: "Se en steg-för-steg-demonstration.",
    introTry: "Öva varje steg själv. Tips hjälper dig på vägen.", introTest: "Slutför varje steg utan hjälp. Du behöver {p} % för att bli godkänd.",
    watchAgain: "Se igen", tryAgain: "Försök igen", youScored: "Ditt resultat", correctSteps: "{c} av {t} steg rätt",
    skip: "Hoppa över", exit: "Avsluta", finding: "Letar efter elementet på sidan…", goToPage: "Gå till sidan", close: "Stäng",
    seeThrough: "Se genom kortet", notFound: "Elementet hittades inte än. Öppna rätt sida eller hoppa över steget.", assistDone: "Du har slutfört processen.",
    stepsLabel: "Steg", narrationOn: "Uppläsning på", narrationOff: "Uppläsning av", demo: "Demo", practice: "Övning", assessment: "Test",
  },
};

/** Merge core UI strings, player extras and caller overrides (overrides win). */
export function playerStrings(lang: string, override?: Record<string, string>): Record<string, string> {
  const base = (lang || "en").toLowerCase().split(/[-_]/)[0];
  return { ...EXTRA.en, ...(EXTRA[base] ?? {}), ...uiStrings(base), ...(override ?? {}) };
}

/** Replace {x} placeholders. */
export function fill(s: string, vars: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
