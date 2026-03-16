from __future__ import annotations

import sys
import time
import json
from collections import Counter
from typing import Optional

import win32clipboard
from pywinauto import Desktop
from pywinauto.keyboard import send_keys


def get_clipboard_text() -> Optional[str]:
    try:
        win32clipboard.OpenClipboard()
        if win32clipboard.IsClipboardFormatAvailable(win32clipboard.CF_UNICODETEXT):
            return win32clipboard.GetClipboardData(win32clipboard.CF_UNICODETEXT)
        return None
    finally:
        try:
            win32clipboard.CloseClipboard()
        except Exception:
            pass


def set_clipboard_text(text: str) -> None:
    try:
        win32clipboard.OpenClipboard()
        win32clipboard.EmptyClipboard()
        win32clipboard.SetClipboardText(text, win32clipboard.CF_UNICODETEXT)
    finally:
        try:
            win32clipboard.CloseClipboard()
        except Exception:
            pass


def find_codex_window():
    windows = Desktop(backend="uia").windows(title="Codex")
    if not windows:
      raise RuntimeError("Could not find the live Codex desktop window.")
    return windows[0]


def find_input_surface(window):
    window_rect = window.rectangle()
    candidates = []

    for control in window.descendants():
        try:
            info = control.element_info
            rect = control.rectangle()
            if rect.top < window_rect.bottom - 180:
                continue
            if rect.width() < 200 or rect.height() < 20:
                continue

            class_name = info.class_name or ""
            control_type = str(info.control_type or "")
            name = control.window_text() or info.name or ""

            score = 0
            if "ProseMirror" in class_name:
                score += 5
            if "follow-up" in name.lower():
                score += 4
            if "Group" in control_type:
                score += 1
            if rect.bottom <= window_rect.bottom:
                score += 1

            if score > 0:
                candidates.append((score, rect.top, control))
        except Exception:
            continue

    if not candidates:
        raise RuntimeError("Could not identify the Codex chat input surface.")

    candidates.sort(key=lambda item: (-item[0], -item[1]))
    return candidates[0][2]


def find_send_button(window):
    window_rect = window.rectangle()
    candidates = []

    for control in window.descendants():
        try:
            info = control.element_info
            rect = control.rectangle()
            if rect.top < window_rect.bottom - 120:
                continue
            if rect.right < window_rect.right - 240:
                continue

            control_type = str(info.control_type or "")
            class_name = info.class_name or ""
            name = control.window_text() or info.name or ""

            score = 0
            if "Button" in control_type:
                score += 3
            if "rounded-full" in class_name:
                score += 2
            if rect.width() <= 40 and rect.height() <= 40:
                score += 2
            if not name.strip():
                score += 1

            if score > 0:
                candidates.append((score, rect.left, control))
        except Exception:
            continue

    if not candidates:
        return None

    candidates.sort(key=lambda item: (-item[0], -item[1]))
    return candidates[0][2]


def collect_visible_texts(window):
    window_rect = window.rectangle()
    lines = []
    window_midpoint = window_rect.left + (window_rect.width() // 2)

    for control in window.descendants():
        try:
            info = control.element_info
            if str(info.control_type) != "Text":
                continue

            text = (control.window_text() or "").strip()
            if not text:
                continue

            rect = control.rectangle()
            if rect.top < window_rect.top + 40:
                continue
            if rect.bottom > window_rect.bottom - 120:
                continue
            if rect.left < window_rect.left + 220:
                continue
            if rect.left > window_midpoint + 40:
                continue

            if text in {
                "Codex",
                "Threads",
                "Settings",
                "Terminal",
                "PowerShell",
                "Local",
                "Full access",
                "Enable back-and-forth chat",
                "Ask for follow-up changes",
                "Success",
                "Shell",
                "Ran",
                "Running command",
                "Thinking",
            }:
                continue

            lines.append((rect.top, rect.left, text))
        except Exception:
            continue

    return [(top, left, text.strip()) for top, left, text in sorted(lines) if text.strip()]


def normalize_reply_text(text: str) -> str:
    cleaned = text.replace("Iâ€™", "I’").replace("â€™", "’")
    cleaned = cleaned.replace("\r", "\n")
    cleaned = "\n".join(part.strip() for part in cleaned.splitlines() if part.strip())
    cleaned = cleaned.replace("\n\n", "\n")
    return cleaned.strip()


def wait_for_codex_reply(window, baseline_texts, prompt):
    baseline_counts = Counter(text for _, _, text in baseline_texts)
    prompt_clean = prompt.strip()
    last_snapshot = baseline_texts
    best_meaningful = []
    stable_cycles = 0
    previous_signature = ""

    for _ in range(90):
        time.sleep(1.0)
        snapshot = collect_visible_texts(window)
        last_snapshot = snapshot
        snapshot_counts = Counter(text for _, _, text in snapshot)
        additions = []
        for _, _, text in snapshot:
            if text.strip() == prompt_clean:
                continue
            if snapshot_counts[text] > baseline_counts.get(text, 0):
                additions.append(text)
                baseline_counts[text] = snapshot_counts[text]
        meaningful = [
            text for text in additions
            if not text.startswith("1 file changed")
            and not text.startswith("+")
            and not text.startswith("-")
            and "file changed" not in text
        ]
        if meaningful:
            best_meaningful = meaningful
            signature = "\n".join(meaningful)
            if signature == previous_signature:
                stable_cycles += 1
            else:
                stable_cycles = 0
                previous_signature = signature

            if stable_cycles >= 2:
                return normalize_reply_text("\n\n".join(best_meaningful))

    snapshot_counts = Counter(text for _, _, text in last_snapshot)
    additions = []
    for _, _, text in last_snapshot:
        if text.strip() == prompt_clean:
            continue
        if snapshot_counts[text] > baseline_counts.get(text, 0):
            additions.append(text)
            baseline_counts[text] = snapshot_counts[text]

    final_reply = "\n\n".join(best_meaningful or additions).strip()
    return normalize_reply_text(final_reply)


def main() -> int:
    if len(sys.argv) < 2:
        raise RuntimeError("Prompt text is required.")

    prompt = sys.argv[1]
    previous_clipboard = get_clipboard_text()

    try:
        window = find_codex_window()
        window.restore()
        window.set_focus()
        time.sleep(0.45)
        baseline_texts = collect_visible_texts(window)

        input_surface = find_input_surface(window)
        rect = input_surface.rectangle()
        click_offsets = (
            (180, max(10, rect.height() // 2)),
            (260, max(10, rect.height() // 2)),
        )
        for x_offset, y_offset in click_offsets:
            target_x = min(rect.width() - 12, x_offset)
            target_y = min(rect.height() - 6, y_offset)
            input_surface.click_input(coords=(target_x, target_y))
            time.sleep(0.18)

        set_clipboard_text(prompt)
        send_keys("^a", pause=0.03)
        time.sleep(0.08)
        send_keys("^v", pause=0.03, with_spaces=True)
        time.sleep(0.25)

        send_button = find_send_button(window)
        if send_button is not None:
            send_button.click_input()
            time.sleep(0.2)
        else:
            send_keys("{ENTER}", pause=0.03)
            time.sleep(0.2)

        reply_text = wait_for_codex_reply(window, baseline_texts, prompt)
    finally:
        if previous_clipboard is not None:
            set_clipboard_text(previous_clipboard)

    print(json.dumps({"submitted": prompt, "reply": reply_text}))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
