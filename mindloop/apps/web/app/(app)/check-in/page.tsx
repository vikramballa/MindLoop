"use client";

import { useEffect, useState } from "react";
import { CheckInFlow } from "@/features/checkin/CheckInFlow";

/** Full-screen check-in. `?mood=1..5` starts on the feelings step; `?prompt=1` asks today's question. */
export default function CheckInPage() {
  const [params, setParams] = useState<{ mood: number | null; prompt: boolean } | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const m = Number(q.get("mood"));
    // One-time read of the URL after hydration.
    setParams({ mood: m >= 1 && m <= 5 ? m : null, prompt: q.get("prompt") === "1" }); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  if (!params) return null;
  return <CheckInFlow initialMood={params.mood} usePrompt={params.prompt} />;
}
