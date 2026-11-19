"use client";

import { useEffect, useState } from "react";
import { applyTheme, readThemeChoice, type ThemeChoice } from "@/lib/theme";

const OPTIONS: [ThemeChoice, string, string][] = [
  ["light", "Light", "Light"],
  ["system", "Auto", "Follow system"],
  ["dark", "Dark", "Dark"],
];

export default function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => setChoice(readThemeChoice()), []);

  // While following the system, react when the device switches between light and dark.
  useEffect(() => {
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);

  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex overflow-hidden rounded-lg border border-border text-xs">
      {OPTIONS.map(([value, icon, label]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={choice === value}
          title={label}
          aria-label={label}
          className={`px-2 py-1 ${choice === value ? "bg-accent text-[var(--accent-fg)]" : "bg-surface hover:bg-background"}`}
          onClick={() => {
            setChoice(value);
            applyTheme(value);
          }}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
