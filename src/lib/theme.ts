export type ThemeChoice = "light" | "dark" | "system";
export const THEME_KEY = "theme";

/**
 * Runs in <head> before the page paints: applies the saved choice (or the system setting)
 * as data-theme on <html>, so there is no flash of the wrong colors.
 */
export const THEME_SCRIPT = `(function(){try{var c=localStorage.getItem("${THEME_KEY}")}catch(e){}
var d=c==="dark"||(c!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
document.documentElement.dataset.theme=d?"dark":"light";})();`;

export function readThemeChoice(): ThemeChoice {
  try {
    const c = localStorage.getItem(THEME_KEY);
    return c === "light" || c === "dark" ? c : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* storage unavailable (private window): the choice lasts for this page only */
  }
}
