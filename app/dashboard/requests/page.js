import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// "Now showing" moved into each game: the Campaigns tab. Old links and notifications land on the games list.
export default function NowShowingMoved() {
  redirect("/dashboard/games");
}
