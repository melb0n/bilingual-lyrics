import { LANG_NAMES, type Lang, type SongStyle } from "@/lib/types";

const FONTS = ["Arial", "Helvetica", "Verdana", "Tahoma", "Trebuchet MS", "Georgia", "Times New Roman", "Montserrat", "Open Sans"];

export default function StylePanel({ style, onChange }: { style: SongStyle; onChange: (s: SongStyle) => void }) {
  const set = <K extends keyof SongStyle>(key: K, value: SongStyle[K]) => onChange({ ...style, [key]: value });
  return (
    <div className="card space-y-3 p-4">
      <div className="text-sm font-semibold">Style</div>
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
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Text color</label>
          <input type="color" className="h-9 w-full rounded" value={style.color} onChange={(e) => set("color", e.target.value)} />
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
          <option value="main">Original language only</option>
          <option value="both">Both languages</option>
          <option value="none">No chords</option>
        </select>
      </div>
      <p className="text-xs text-muted">Background is for preview only; ProPresenter uses your theme or media.</p>
    </div>
  );
}
