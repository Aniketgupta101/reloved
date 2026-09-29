import type { AnalyticsMetric, AnalyticsSnapshot } from "@shared/adminControlCenter";
import { AdminPageHeader, ResourceNotice, SourceDetails } from "./AdminResourceView";
import { useAdminResource } from "@/lib/adminResource";
import "./admin-support-analytics.css";

export function AnalyticsMetricCard({ metric }: { metric: AnalyticsMetric }) {
  return <article className={`analytics-metric ${metric.value === null ? "is-unavailable" : ""}`}><p className="admin-eyebrow">{metric.source}</p><h3>{metric.label}</h3>{metric.value === null ? <strong className="metric-message">{metric.message || "Not enough reliable data yet."}</strong> : <strong className="metric-value">{metric.value.toLocaleString("en-IN")}</strong>}<p>{metric.definition}</p></article>;
}
const labels: Record<keyof AnalyticsSnapshot["sections"], { title: string; copy: string }> = {
  overview: { title: "Overview", copy: "Reliable outcome and activity measures." }, acquisition: { title: "Acquisition", copy: "How new people find Reloved." }, activation: { title: "Activation", copy: "Whether people complete the first useful step." }, dropFunnel: { title: "Drop funnel", copy: "Available Give journey evidence." }, claimFunnel: { title: "Claim funnel", copy: "Available Claim journey evidence." }, fulfillment: { title: "Fulfillment", copy: "Delivery and communication outcomes." }, retention: { title: "Retention", copy: "Cohort return behavior." }, supplyDemand: { title: "Supply & demand", copy: "Current available supply against claims in range." },
};
export function AdminAnalyticsContent({ range, onRange }: { range: "7d"|"30d"; onRange: (v:"7d"|"30d")=>void }) {
 const resource=useAdminResource<AnalyticsSnapshot>(`/api/admin/control-center/analytics/snapshot?range=${range}`,()=>false);
 return <div className="admin-control-center"><AdminPageHeader title="Analytics" description="Product and stakeholder reporting from operational Firestore truth, notification logs, and mirrored product events." refresh={resource.refresh} refreshing={resource.refreshing} asOf={resource.data?.asOf}><div className="admin-segmented"><button className={range==="7d"?"is-active":""} onClick={()=>onRange("7d")}>Last 7 days</button><button className={range==="30d"?"is-active":""} onClick={()=>onRange("30d")}>Last 30 days</button></div></AdminPageHeader><ResourceNotice resource={resource}/>{resource.data && <>{(Object.keys(labels) as Array<keyof AnalyticsSnapshot["sections"]>).map(key=><section className="analytics-section" key={key}><header><h2>{labels[key].title}</h2><p>{labels[key].copy}</p></header><div className="analytics-grid">{resource.data!.sections[key].map(m=><AnalyticsMetricCard key={m.id} metric={m}/>)}</div></section>)}<SourceDetails data={resource.data}/></>}</div>;
}
