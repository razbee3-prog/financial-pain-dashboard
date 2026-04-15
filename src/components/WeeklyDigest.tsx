"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

interface Digest {
  takeaways: string[];
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
}

export default function WeeklyDigest() {
  const [digest, setDigest] = useState<Digest | null>(null);

  useEffect(() => {
    fetch("/api/digest")
      .then((r) => r.json())
      .then((d) => setDigest(d.digest));
  }, []);

  if (!digest) return null;

  return (
    <div className="bg-card border border-card-border rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} className="text-accent" />
        <h2 className="text-sm font-semibold">This week</h2>
        <span className="text-[10px] text-muted ml-auto">
          {new Date(digest.generatedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {digest.takeaways.map((t, i) => (
          <div key={i} className="flex gap-3 text-sm">
            <span className="text-accent font-semibold tabular-nums shrink-0">
              {i + 1}.
            </span>
            <span className="text-muted leading-relaxed">{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
