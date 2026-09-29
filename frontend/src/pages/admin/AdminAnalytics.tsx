import { useState } from "react";
import { AdminAnalyticsContent } from "@/components/admin/AdminAnalyticsContent";
export function AdminAnalytics() {
  const [range, setRange] = useState<"7d" | "30d">("7d");
  return <AdminAnalyticsContent range={range} onRange={setRange} />;
}
