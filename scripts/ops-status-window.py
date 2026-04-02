#!/usr/bin/env python3
import json
import os
import sys
import tkinter as tk
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 2:
        return 1

    status_path = Path(sys.argv[1])
    root = tk.Tk()
    root.title("Airo OPS Status")
    root.geometry("520x180")
    root.configure(bg="#070b14")
    root.attributes("-topmost", True)
    root.resizable(False, False)

    frame = tk.Frame(root, bg="#070b14", padx=20, pady=20)
    frame.pack(fill="both", expand=True)

    title_var = tk.StringVar(value="Airo OPS")
    step_var = tk.StringVar(value="Starting...")
    detail_var = tk.StringVar(value="Preparing deploy window...")

    tk.Label(
        frame,
        textvariable=title_var,
        fg="#d8f3ff",
        bg="#070b14",
        font=("Helvetica", 18, "bold"),
        anchor="w",
    ).pack(fill="x")

    tk.Label(
        frame,
        textvariable=step_var,
        fg="#7dd3fc",
        bg="#070b14",
        font=("Helvetica", 22, "bold"),
        anchor="w",
        pady=18,
    ).pack(fill="x")

    tk.Label(
        frame,
        textvariable=detail_var,
        fg="#9ca3af",
        bg="#070b14",
        font=("Helvetica", 12),
        anchor="w",
        justify="left",
        wraplength=470,
    ).pack(fill="x")

    def refresh() -> None:
        try:
            payload = json.loads(status_path.read_text("utf8"))
        except Exception:
            root.after(600, refresh)
            return

        title_var.set(str(payload.get("title") or "Airo OPS"))
        step_var.set(str(payload.get("step") or "Working..."))
        detail_var.set(str(payload.get("detail") or ""))

        if payload.get("done"):
            root.after(int(payload.get("closeAfterMs") or 1800), root.destroy)
            return

        root.after(600, refresh)

    root.after(100, refresh)
    root.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
