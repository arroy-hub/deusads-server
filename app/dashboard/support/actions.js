"use server";

import { revalidatePath } from "next/cache";
import { getMember } from "../../../lib/admin";
import * as support from "../../../lib/support-server";

// Every action re-checks who is calling: a server action is a public endpoint. The rules (who may change a status
// or a type, whose folders and requests are whose) are applied in lib/support-server.js.

async function run(work) {
  const me = await getMember();
  if (!me) return { error: "Your session expired. Sign in again." };
  const result = await work(me.service, { id: me.user.id, role: me.role });
  if (result?.ok) {
    revalidatePath("/dashboard", "layout");
    revalidatePath("/dashboard/support");
    revalidatePath("/dashboard/admin/support");
  }
  return result;
}

export const changeStatus = async ({ requestId, status }) => run((db, actor) => support.setStatus(db, { actor, requestId, status }));
export const changeStatusMany = async ({ ids, status }) => run((db, actor) => support.setStatusMany(db, { actor, ids, status }));
export const changeType = async ({ requestId, type }) => run((db, actor) => support.setType(db, { actor, requestId, type }));
export const openRequest = async ({ requestId }) => run((db, actor) => support.markRead(db, { actor, requestId }));
export const newFolder = async ({ name }) => run((db, actor) => support.createFolder(db, { actor, name }));
export const renameFolder = async ({ folderId, name }) => run((db, actor) => support.renameFolder(db, { actor, folderId, name }));
export const removeFolder = async ({ folderId }) => run((db, actor) => support.deleteFolder(db, { actor, folderId }));
export const placeInFolder = async ({ folderId = null, orderedIds }) => run((db, actor) => support.placeRequests(db, { actor, folderId, orderedIds }));
