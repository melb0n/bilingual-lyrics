"use client";

import { useEffect, useState } from "react";
import { friendlyError } from "@/lib/errors";
import type { PcoSongForImport } from "@/lib/pco";
import { planUpdate, type UpdatePlan } from "@/lib/pcoUpdate";
import type { Song } from "@/lib/types";

/** Preview what Planning Center would change on a linked song, then apply it (undo is available). */
export default function PcoUpdatePanel({ song, onApply, onClose }: { song: Song; onApply: (s: Song) => void; onClose: () => void }) {
  const [plan, setPlan] = useState<UpdatePlan | null>(null);
  const [arrangement, setArrangement] = useState("");
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    if (!song.pco) return;
    const q = new URLSearchParams({ songId: song.pco.songId, arrangementId: song.pco.arrangementId });
    fetch(`/api/pco/import?${q}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(friendlyError(data.error, res.status));
        const p = data as PcoSongForImport;
        setArrangement(p.arrangementName ?? "");
        setPlan(planUpdate(song, p));
      })
      .catch((e) => setError((e as Error).message));
    // Plan once, against the song as it was when the panel opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted">Update from Planning Center</div>
          <p className="mt-1 text-sm text-muted">
            Reads {arrangement ? `the “${arrangement}” arrangement` : "the linked arrangement"} in Planning Center and shows what would change.
            Nothing changes until you apply it.
          </p>
        </div>
        <button className="btn btn-sm shrink-0" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      {!plan && !error && <p className="text-sm text-muted">Checking Planning Center…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {plan && !plan.changed && <p className="text-sm text-green-700 dark:text-green-400">Already up to date with Planning Center.</p>}
      {plan?.changed && !applied && (
        <>
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {plan.summary.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                onApply(plan.next);
                setApplied(true);
              }}
            >
              Apply update
            </button>
            <button className="btn btn-sm" onClick={onClose}>
              Cancel
            </button>
          </div>
        </>
      )}
      {applied && (
        <p className="text-sm text-green-700 dark:text-green-400">
          Updated from Planning Center. Not right? Use Undo in the alignment preview.
        </p>
      )}
    </div>
  );
}
