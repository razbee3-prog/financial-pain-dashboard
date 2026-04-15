"use client";

import { useState, useEffect } from "react";
import TopQuotes from "@/components/TopQuotes";
import MetricCards from "@/components/MetricCards";
import ThemeToggle from "@/components/ThemeToggle";
import WeeklyDigest from "@/components/WeeklyDigest";
import CategoryChart from "@/components/CategoryChart";
import TrendChart from "@/components/TrendChart";
import PainFeed from "@/components/PainFeed";

export default function Dashboard() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [lastScraped, setLastScraped] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => setLastScraped(d.lastScraped));
  }, []);

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="border-b border-card-border h-12 flex items-center px-6 sticky top-0 z-20 bg-background/80 backdrop-blur-md">
        <span className="text-sm font-semibold tracking-tight">
          Pain Pulse
        </span>
        <span className="text-xs text-muted ml-3">
          Financial pain point intelligence
        </span>
        <div className="flex items-center gap-3 ml-auto">
          {lastScraped && (
            <span className="text-xs text-muted tabular-nums">
              {new Date(lastScraped).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          )}
          <ThemeToggle />
        </div>
      </nav>

      <main className="max-w-[1320px] mx-auto px-6 py-6">
        {/* Hero: Top quotes */}
        <TopQuotes />

        {/* Metrics */}
        <div className="mt-6">
          <MetricCards />
        </div>

        {/* Digest */}
        <div className="mt-4">
          <WeeklyDigest />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mt-4">
          <div className="lg:col-span-3">
            <CategoryChart
              onCategoryClick={setSelectedCategory}
              selectedCategory={selectedCategory}
            />
          </div>
          <div className="lg:col-span-2">
            <TrendChart />
          </div>
        </div>

        {/* Feed */}
        <div className="mt-6">
          <PainFeed externalCategory={selectedCategory} />
        </div>
      </main>
    </div>
  );
}
