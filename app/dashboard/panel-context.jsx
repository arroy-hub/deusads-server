"use client";

import { createContext } from "react";

/** Whether the page's Statistics panel is open. The report frame provides it; the widget board in the panel reads it. */
export const PanelCtx = createContext(null);
