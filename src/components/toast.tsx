"use client";

import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { useEffect, useState } from "react";

export type ToastKind = "success" | "error" | "info";
export function Toast({ kind: requestedKind, type, title, message, onClose, duration = 7000 }: { kind?: ToastKind; type?: ToastKind; title: string; message: string; onClose?: () => void; duration?: number }) {
  const kind = requestedKind ?? type ?? "info";
  const [visible, setVisible] = useState(true);
  useEffect(() => { if (!duration) return; const timer = window.setTimeout(() => { setVisible(false); onClose?.(); }, duration); return () => window.clearTimeout(timer); }, [duration, onClose]);
  if (!visible) return null;
  const Icon = kind === "success" ? CheckCircle2 : kind === "error" ? CircleAlert : Info;
  return <div className={`toast toast-${kind}`} role={kind === "error" ? "alert" : "status"} aria-live={kind === "error" ? "assertive" : "polite"}><Icon size={21} /><div><strong>{title}</strong><p>{message}</p></div><button type="button" onClick={() => { setVisible(false); onClose?.(); }} aria-label="Dismiss notification"><X size={17} /></button></div>;
}
