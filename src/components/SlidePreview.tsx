import { otherLang, soloLang, type Slide, type SongStyle } from "@/lib/types";

/** Approximates a 1920x1080 ProPresenter slide (text box positions match the exported .pro), scaled to fit. */
export default function SlidePreview({ slide, style }: { slide: Slide; style: SongStyle }) {
  const bottom = otherLang(style.topLang);
  // fontSize is in 1080p pixels; the preview is ~1/5.5 scale.
  const size = `calc(${style.fontSize} * 100cqw / 1920)`;
  const base = {
    fontFamily: style.font,
    fontSize: size,
    lineHeight: 1.2,
    fontWeight: style.bold ? 700 : 400,
    textTransform: style.allCaps ? ("uppercase" as const) : undefined,
  };
  const topStyle = { ...base, color: style.color };
  const bottomStyle = { ...base, color: style.bottomColor ?? style.color };
  const solo = soloLang(slide, style);
  return (
    <div>
      <div className="label">Slide preview</div>
      <div
        className="relative aspect-video w-full overflow-hidden rounded-lg border border-border"
        style={{ background: style.background, containerType: "inline-size" }}
      >
        {solo ? (
          // Matches the .pro: a language shown alone fills both text areas, centered on screen.
          <div className="absolute left-[1.4%] right-[1.5%] top-[1.3%] bottom-[3.5%] flex items-center justify-center text-center whitespace-pre-line">
            <div style={solo === style.topLang ? topStyle : bottomStyle}>{slide[solo]}</div>
          </div>
        ) : (
          <>
            <div className="absolute left-[1.4%] right-[1.5%] top-[1.3%] bottom-[52.4%] flex items-center justify-center text-center whitespace-pre-line">
              <div style={topStyle}>{slide[style.topLang]}</div>
            </div>
            <div className="absolute left-[1.4%] right-[1.5%] top-[51.4%] bottom-[3.5%] flex items-center justify-center text-center whitespace-pre-line">
              <div style={bottomStyle}>{slide[bottom]}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
