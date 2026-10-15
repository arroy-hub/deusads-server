"use client";

import { Field, Group, PopBtn, Seg, Switch } from "./_cabinet/filters";
import { IcGear } from "./_cabinet/icons";
import { formatDay } from "../../lib/analytics";

const BREAKDOWN_TEXT = { total: "All selected campaigns", campaign: "By campaign", creative: "By creative" };

/**
 * The head of the Overview chart: the title with what is shown under it, and one "View" button whose panel holds
 * every setting of the chart (breakdown, day or week, pauses and blocks, comparison with the period before).
 */
export default function ChartHead({ days, dates, grain, setGrain, breakdown, setBreakdown, marks, setMarks, compare, setCompare, hasPrevious, hasSplit }) {
  const compareOn = compare && breakdown === "total";
  const onCompare = (on) => {
    setCompare(on);
    if (on) setBreakdown("total");
  };
  const breakdowns = [
    ["total", "Total"],
    ["campaign", "Campaign"],
    ["creative", "Creative", !hasSplit, !hasSplit ? "Needs migration 0027_advertiser_daily_split.sql in the Supabase SQL editor" : undefined],
  ];
  const grains = [["day", "Day"], ["week", "Week", days < 14]];
  return (
    <div className="ovx-chart-head fl-head">
      <div className="fl-titleblock">
        <h2 id="ovx-chart-title">Impressions per {grain}</h2>
        <p className="fl-sub">{BREAKDOWN_TEXT[breakdown]} · {formatDay(dates[0])} – {formatDay(dates[dates.length - 1])}</p>
      </div>
      <PopBtn label="View" icon={<IcGear size={14} />} align="end" width={340}>
        <Field label="Break down by"><Seg full value={breakdown} options={breakdowns} onChange={setBreakdown} label="Break down by" /></Field>
        <Field label="Per"><Seg full value={grain} options={grains} onChange={setGrain} label="Granularity" /></Field>
        <div className="fl-divider" />
        <Switch on={marks} onChange={setMarks} title="Pauses and blocks" hint="Mark when a campaign went live, was paused or blocked" />
        <Switch
          on={compareOn}
          onChange={onCompare}
          disabled={!hasPrevious}
          title="Compare with previous period"
          hint={hasPrevious ? `Shows the ${days} days before as a dashed line` : "No impressions in the period before"}
        />
      </PopBtn>
    </div>
  );
}
