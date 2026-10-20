"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MenuItem, MenuSep, Pop } from "../_cabinet/ui";
import { IcCopy, IcGear, IcGrid, IcMore, IcPause, IcPlay, IcReport } from "../_cabinet/icons";
import { duplicateCampaign } from "./actions";
import { navigating } from "../_cabinet/nav";

/** The ⋯ menu of a campaign: report, placements, settings, pause or resume, duplicate. Used on cards and on strips. */
export default function RowMenu({ campaign, rules, onPause }) {
  const router = useRouter();
  const btn = useRef(null);
  const [open, setOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [problem, setProblem] = useState("");
  const draft = campaign.status.key === "draft";
  const canPause = rules && campaign.canPause;
  const paused = campaign.status.key === "paused";
  const close = () => setOpen(false);
  async function copy() {
    setCopying(true);
    setProblem("");
    const result = await duplicateCampaign({ campaignId: campaign.id }).catch(() => ({ error: "Connection lost. Try again." }));
    setCopying(false);
    if (result?.error) return setProblem(result.error);
    close();
    navigating();
    router.push(`/dashboard/advertising/new?campaign=${result.campaignId}`);
  }
  return (
    <>
      <button ref={btn} type="button" className="rd-more" aria-label={`Actions for ${campaign.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}><IcMore /></button>
      <Pop anchor={btn} open={open} onClose={close} width={224} label={`Actions for ${campaign.name}`}>
        <Link role="menuitem" className="rd-mi" href={draft ? `/dashboard/advertising/new?campaign=${campaign.id}` : `/dashboard/advertising/c/${campaign.id}`} onClick={close}><span className="rd-mi-ic"><IcReport /></span><span className="rd-mi-text">{draft ? "Continue setup" : "Open report"}</span></Link>
        <Link role="menuitem" className="rd-mi" href={`/dashboard/advertising/c/${campaign.id}/placements`} onClick={close}><span className="rd-mi-ic"><IcGrid /></span><span className="rd-mi-text">Placements</span></Link>
        <Link role="menuitem" className="rd-mi" href={`/dashboard/advertising/c/${campaign.id}/settings`} onClick={close}><span className="rd-mi-ic"><IcGear /></span><span className="rd-mi-text">Settings</span></Link>
        <MenuSep />
        {canPause && <MenuItem icon={paused ? <IcPlay /> : <IcPause />} onClick={() => { close(); onPause(paused ? "resume" : "pause"); }}>{paused ? "Resume…" : "Pause…"}</MenuItem>}
        {rules && <MenuItem icon={<IcCopy />} onClick={copy} disabled={copying}>{copying ? "Copying…" : "Duplicate"}</MenuItem>}
        {problem && <div className="rd-pop-note error" role="alert">{problem}</div>}
      </Pop>
    </>
  );
}
