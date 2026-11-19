import { chordSegments } from "@/lib/chordpro";

/** One lyric line with its chords drawn above the right syllables. */
export default function ChordLine({ line, chordClass = "text-blue-700" }: { line: string; chordClass?: string }) {
  const segs = chordSegments(line);
  if (!segs.some((s) => s.chord)) return <div className="whitespace-pre-wrap">{line || " "}</div>;
  return (
    <div className="flex flex-wrap items-end">
      {segs.map((s, i) => (
        <span key={i} className="inline-flex flex-col">
          <span className={`h-[1.2em] pr-1 text-[0.8em] font-bold leading-tight ${chordClass}`}>{s.chord || " "}</span>
          <span className="whitespace-pre">{s.text || (s.chord ? " " : "")}</span>
        </span>
      ))}
    </div>
  );
}
