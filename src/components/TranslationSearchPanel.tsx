import type { TranslationSearchResult } from "@/app/api/find-translation/route";
import { LANG_NAMES, type Lang } from "@/lib/types";

interface Props {
  result: TranslationSearchResult;
  target: Lang;
  onUseTitle: (title: string) => void;
  onClose: () => void;
}

export default function TranslationSearchPanel({ result, target, onUseTitle, onClose }: Props) {
  return (
    <div className={`card space-y-3 p-4 ${result.found ? "border-accent" : ""}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted">Official translation search</div>
          {result.found ? (
            <div className="mt-1 text-base font-semibold">
              Found {target === "en" ? "an" : "a"} {LANG_NAMES[target]} version: “{result.officialTitle}”
              {result.artist && <span className="font-normal text-muted"> — {result.artist}</span>}
            </div>
          ) : (
            <div className="mt-1 text-base font-semibold">No official {LANG_NAMES[target]} version found</div>
          )}
          {result.notes && <p className="mt-1 text-sm text-muted">{result.notes}</p>}
        </div>
        <button className="btn btn-sm shrink-0" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      {result.sources.length > 0 && (
        <ul className="space-y-1 text-sm">
          {result.sources.map((s) => (
            <li key={s.url} className="truncate">
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                {s.title || s.url}
              </a>{" "}
              <span className="text-xs text-muted">{new URL(s.url).hostname.replace(/^www\./, "")}</span>
            </li>
          ))}
        </ul>
      )}

      {result.found ? (
        <p className="text-sm">
          Open a link, copy the {LANG_NAMES[target]} lyrics, and paste them into the <b>{LANG_NAMES[target]}</b> editor.
          They&apos;ll be lined up with the original automatically. Check that your church&apos;s license (e.g. CCLI)
          covers projecting them.
        </p>
      ) : (
        <p className="text-sm text-muted">Type the {LANG_NAMES[target]} lyrics into the {LANG_NAMES[target]} editor.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {result.found && result.officialTitle && (
          <button className="btn btn-sm" onClick={() => onUseTitle(result.officialTitle)}>
            Use “{result.officialTitle}” as the {LANG_NAMES[target]} title
          </button>
        )}
      </div>
    </div>
  );
}
