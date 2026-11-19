import { otherLang, type Slide, type SongStyle } from "@/lib/types";

/** Approximates a 1920x1080 ProPresenter slide, scaled to fit. */
export default function SlidePreview({ slide, style }: { slide: Slide; style: SongStyle }) {
  const bottom = otherLang(style.topLang);
  // fontSize is in 1080p pixels; the preview is ~1/5.5 scale.
  const size = `calc(${style.fontSize} * 100cqw / 1920)`;
  const textStyle = { fontFamily: style.font, color: style.color, fontSize: size, lineHeight: 1.2 };
  return (
    <div>
      <div className="label">Slide preview</div>
      <div
        className="relative aspect-video w-full overflow-hidden rounded-lg border border-border"
        style={{ background: style.background, containerType: "inline-size" }}
      >
        <div className="absolute inset-x-[4%] top-[6%] bottom-[52%] flex items-center justify-center text-center whitespace-pre-line">
          <div style={textStyle}>{slide[style.topLang]}</div>
        </div>
        <div className="absolute inset-x-[4%] top-[52%] bottom-[6%] flex items-center justify-center text-center whitespace-pre-line">
          <div style={textStyle}>{slide[bottom]}</div>
        </div>
      </div>
    </div>
  );
}
