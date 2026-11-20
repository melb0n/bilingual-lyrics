import { LANG_NAMES, VB_THEME_STYLE, type Lang, type SongStyle } from "@/lib/types";

const FONTS = ["Arial", "Helvetica", "Verdana", "Tahoma", "Trebuchet MS", "Georgia", "Times New Roman", "Montserrat", "Open Sans"];

export default function StylePanel({
  style,
  onChange,
  mainLang,
}: {
  style: SongStyle;
  onChange: (s: SongStyle) => void;
  mainLang?: Lang;
}) {
  const main = mainLang ?? "en";
  const second: Lang = main === "en" ? "es" : "en";
  const set = <K extends keyof SongStyle>(key: K, value: SongStyle[K]) => onChange({ ...style, [key]: value });
  async function downloadTheme() {
    const { exportThemeZip } = await import("@/lib/pro/theme");
    const bytes = await exportThemeZip("Bilingual Lyrics", style, main);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/octet-stream" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "Bilingual Lyrics.proTheme";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold">Style</div>
        <button
          type="button"
          className="btn btn-sm ml-auto"
          title="Arial Bold 100pt, all caps, white top box, yellow bottom box, text scaled to fit"
          onClick={() => onChange({ ...style, ...VB_THEME_STYLE })}
        >
          Use bold all-caps preset
        </button>
      </div>
      <div>
        <label className="label">Top language</label>
        <select className="input" value={style.topLang} onChange={(e) => set("topLang", e.target.value as Lang)}>
          {(Object.keys(LANG_NAMES) as Lang[]).map((l) => (
            <option key={l} value={l}>
              {LANG_NAMES[l]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Font</label>
        <select className="input" value={style.font} onChange={(e) => set("font", e.target.value)}>
          {FONTS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Font size ({style.fontSize}pt)</label>
        <input
          type="range"
          min={30}
          max={120}
          step={2}
          className="w-full"
          value={style.fontSize}
          onChange={(e) => set("fontSize", Number(e.target.value))}
        />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={!!style.bold} onChange={(e) => set("bold", e.target.checked)} /> Bold
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={!!style.allCaps} onChange={(e) => set("allCaps", e.target.checked)} /> All caps
        </label>
        <label className="flex items-center gap-1.5" title="ProPresenter scaling: Text up or down">
          <input type="checkbox" checked={!!style.scaleToFit} onChange={(e) => set("scaleToFit", e.target.checked)} />{" "}
          Scale text to fit
        </label>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label">Top text</label>
          <input type="color" className="h-9 w-full rounded" value={style.color} onChange={(e) => set("color", e.target.value)} />
        </div>
        <div>
          <label className="label">Bottom text</label>
          <input
            type="color"
            className="h-9 w-full rounded"
            value={style.bottomColor ?? style.color}
            onChange={(e) => set("bottomColor", e.target.value)}
          />
        </div>
        <div>
          <label className="label">Background</label>
          <input type="color" className="h-9 w-full rounded" value={style.background} onChange={(e) => set("background", e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label">Chords in the .pro file (stage display)</label>
        <select
          className="input"
          value={style.stageChords ?? "main"}
          onChange={(e) => set("stageChords", e.target.value as SongStyle["stageChords"])}
        >
          <option value="main">{LANG_NAMES[main]} only (main)</option>
          <option value="second">{LANG_NAMES[second]} only</option>
          <option value="both">Both languages</option>
          <option value="none">No chords</option>
        </select>
        <p className="mt-1 text-xs text-muted">
          A language only gets chords if it has them in the editor. Use “Lock chords” to copy them across.
        </p>
      </div>
      <div>
        <label className="label" htmlFor="style-single">
          Slides with only one language
        </label>
        <select
          id="style-single"
          className="input"
          value={style.singleLang ?? "center"}
          onChange={(e) => set("singleLang", e.target.value as SongStyle["singleLang"])}
        >
          <option value="center">Center on the screen</option>
          <option value="keep">Keep in its top / bottom box</option>
        </select>
        <p className="mt-1 text-xs text-muted">
          For songs sung in one language, or slides not translated yet.
        </p>
      </div>
      <div>
        <label className="label">Text box names (for the stage display)</label>
        <select
          className="input"
          value={style.boxNames ?? "role"}
          onChange={(e) => set("boxNames", e.target.value as SongStyle["boxNames"])}
        >
          <option value="role">“Main Language” / “Second Language”</option>
          <option value="main-secondary">“Main” / “Secondary”</option>
          <option value="language">
            “{LANG_NAMES[main]}” / “{LANG_NAMES[second]}”
          </option>
        </select>
        <p className="mt-1 text-xs text-muted">
          In ProPresenter&apos;s Stage editor, link a text object to Current Slide → Element Matching Name and type one
          of these names to show only that language.
        </p>
      </div>
      <p className="text-xs text-muted">Background is for preview only; ProPresenter uses your theme or media.</p>
      <div className="border-t border-border pt-3">
        <button type="button" className="btn btn-sm w-full" onClick={downloadTheme}>
          Download ProPresenter theme with this style
        </button>
        <p className="mt-1 text-xs text-muted">
          A “Bilingual Lyrics” theme with this song&apos;s font, colors, positions, box names and chords turned on. In
          ProPresenter choose File → Import → Theme (or double-click the file). Songs from this site already use this
          layout, so you don&apos;t need to apply it to them.
        </p>
      </div>
    </div>
  );
}
