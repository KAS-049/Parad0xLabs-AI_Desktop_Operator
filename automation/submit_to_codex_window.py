from __future__ import annotations

import json
import re
import sys
import time
from dataclasses import asdict, dataclass
from typing import Optional

import win32clipboard
import win32gui
from pywinauto import Desktop
from pywinauto.keyboard import send_keys

CONFIDENCE_THRESHOLD = 0.75


@dataclass
class CheckResult:
    name: str
    passed: bool
    message: str


@dataclass
class AutomationResult:
    submitted: str
    reply: str
    windowTitle: Optional[str]
    confidence: float
    usedClipboard: bool
    usedCoordinateFallback: bool
    partialCapture: bool
    checks: list[CheckResult]
    abortReason: Optional[str]
    debugLog: list[str]


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


def current_foreground_handle() -> int:
    return int(win32gui.GetForegroundWindow())


def is_window_handle_valid(handle: int) -> bool:
    try:
        return bool(win32gui.IsWindow(handle))
    except Exception:
        return False


def emit_result(result: AutomationResult, exit_code: int = 0) -> int:
    print(json.dumps({
        **asdict(result),
        "checks": [asdict(check) for check in result.checks]
    }))
    return exit_code


def build_failure(prompt: str, checks: list[CheckResult], abort_reason: str, confidence: float = 0.0, window_title: Optional[str] = None,
                  used_clipboard: bool = False, used_coordinate_fallback: bool = False, partial_capture: bool = False,
                  debug_log: Optional[list[str]] = None) -> AutomationResult:
    return AutomationResult(
        submitted=prompt,
        reply="",
        windowTitle=window_title,
        confidence=confidence,
        usedClipboard=used_clipboard,
        usedCoordinateFallback=used_coordinate_fallback,
        partialCapture=partial_capture,
        checks=checks,
        abortReason=abort_reason,
        debugLog=debug_log or []
    )


def find_codex_window() -> tuple[object, float]:
    candidates = []
    for window in Desktop(backend="uia").windows():
        try:
            title = (window.window_text() or "").strip()
            if "codex" not in title.lower():
                continue
            rect = window.rectangle()
            score = 0.0
            if title == "Codex":
                score += 0.65
            elif "codex" in title.lower():
                score += 0.45
            if rect.width() >= 600 and rect.height() >= 400:
                score += 0.15
            if window.is_visible():
                score += 0.15
            candidates.append((score, window))
        except Exception:
            continue

    if not candidates:
        raise RuntimeError("Could not find the live Codex desktop window.")

    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1], min(1.0, candidates[0][0])


def find_input_surface(window) -> tuple[object, float]:
    window_rect = window.rectangle()
    candidates = []

    for control in window.descendants():
        try:
            info = control.element_info
            rect = control.rectangle()
            if rect.top < window_rect.bottom - 220:
                continue
            if rect.width() < 220 or rect.height() < 20:
                continue

            class_name = (info.class_name or "").strip()
            control_type = str(info.control_type or "")
            name = (control.window_text() or info.name or "").strip()

            score = 0.0
            if "ProseMirror" in class_name:
                score += 0.5
            if "follow-up" in name.lower():
                score += 0.3
            if "group" in control_type.lower():
                score += 0.08
            if rect.bottom <= window_rect.bottom:
                score += 0.08
            if rect.left >= window_rect.left + 180:
                score += 0.06

            if score > 0:
                candidates.append((score, control))
        except Exception:
            continue

    if not candidates:
        raise RuntimeError("Could not confidently identify the Codex message input area.")

    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1], min(1.0, candidates[0][0])


def find_result_region(window) -> tuple[bool, float]:
    window_rect = window.rectangle()
    text_like = 0
    for control in window.descendants():
        try:
            info = control.element_info
            if str(info.control_type) != "Text":
                continue
            rect = control.rectangle()
            if rect.top < window_rect.top + 40 or rect.bottom > window_rect.bottom - 120:
                continue
            if rect.left < window_rect.left + 220:
                continue
            text_like += 1
        except Exception:
            continue

    if text_like <= 0:
        return False, 0.0

    return True, min(1.0, 0.55 + min(text_like, 6) * 0.05)


def normalize_reply_text(text: str) -> str:
    cleaned = text.replace("IÃ¢â‚¬â„¢", "Iâ€™").replace("Ã¢â‚¬â„¢", "â€™")
    cleaned = cleaned.replace("\r", "\n")
    cleaned = "\n".join(part.strip() for part in cleaned.splitlines() if part.strip())
    cleaned = cleaned.replace("\n\n", "\n")
    return cleaned.strip()


def is_noise_line(text: str) -> bool:
    normalized = text.strip().lower()
    if not normalized:
        return True
    if normalized in {
        "codex",
        "threads",
        "settings",
        "local",
        "full access",
        "thinking",
        "running command",
        "shell",
        "success",
        "undo",
        "details",
    }:
        return True
    if "files changed" in normalized or "file changed" in normalized:
        return True
    if normalized.startswith("c:\\") or normalized.startswith("c:/") or normalized.startswith("..."):
        return True
    if re.search(r"\.(py|ts|tsx|js|jsx|md|json|ps1|cmd|yml|yaml|css|html)\b", normalized):
        return True
    return False


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
            if rect.left > window_midpoint + 60:
                continue
            if is_noise_line(text):
                continue

            lines.append((rect.top, rect.left, text))
        except Exception:
            continue

    return sorted(lines)


def collect_bottom_reply_block(entries, baseline_max_top, prompt_clean):
    recent_entries = [
        (top, text)
        for top, _, text in entries
        if text.strip() != prompt_clean and top >= baseline_max_top - 12 and not is_noise_line(text)
    ]
    if not recent_entries:
        return []

    recent_entries.sort(key=lambda item: item[0])
    block = [recent_entries[-1][1]]
    previous_top = recent_entries[-1][0]

    for top, text in reversed(recent_entries[:-1]):
        if previous_top - top > 90:
            break
        block.append(text)
        previous_top = top

    block.reverse()
    return [text for text in block if text.strip() and not is_noise_line(text)]


def collect_latest_reply_block(entries, prompt_clean):
    filtered = [(top, text) for top, _, text in entries if text.strip() != prompt_clean and not is_noise_line(text)]
    if not filtered:
        return [], 0

    filtered.sort(key=lambda item: item[0])
    latest_top, latest_text = filtered[-1]
    block = [latest_text]
    previous_top = latest_top

    for top, text in reversed(filtered[:-1]):
        if previous_top - top > 90:
            break
        block.append(text)
        previous_top = top

    block.reverse()
    return [text for text in block if text.strip() and not is_noise_line(text)], latest_top


def wait_for_codex_reply(window, prompt: str, expected_handle: int):
    baseline_entries = collect_visible_texts(window)
    baseline_block, baseline_reply_top = collect_latest_reply_block(baseline_entries, prompt.strip())
    baseline_signature = normalize_reply_text("\n\n".join(baseline_block)) if baseline_block else ""
    prompt_clean = prompt.strip()
    previous_signature = ""
    stable_cycles = 0
    partial_capture = False
    last_signature = ""

    for _ in range(200):
        time.sleep(0.25)
        if not is_window_handle_valid(expected_handle):
            raise RuntimeError("The Codex window disappeared during capture.")

        try:
            if not window.is_visible():
                raise RuntimeError("The Codex window is no longer visible during capture.")
        except RuntimeError:
            raise
        except Exception as error:
            raise RuntimeError(f"Could not verify the Codex window during capture: {error}") from error

        entries = collect_visible_texts(window)
        candidate_lines, candidate_top = collect_latest_reply_block(entries, prompt_clean)
        if not candidate_lines:
            continue

        signature = normalize_reply_text("\n\n".join(candidate_lines))
        if not signature:
            continue
        if baseline_signature and signature == baseline_signature and candidate_top <= baseline_reply_top + 12:
            continue

        partial_capture = True
        if signature == previous_signature:
          stable_cycles += 1
        else:
          stable_cycles = 0
          previous_signature = signature
        last_signature = signature

        if stable_cycles >= 2 and signature.endswith((".", "!", "?", "\"")):
            return signature, False

    if last_signature:
        return last_signature, True

    raise RuntimeError("Could not confidently identify the Codex result region during capture.")


def main() -> int:
    if len(sys.argv) < 2:
        raise RuntimeError("Prompt text is required.")

    prompt = sys.argv[1].strip()
    checks: list[CheckResult] = []
    debug_log: list[str] = []
    previous_clipboard = get_clipboard_text()
    used_clipboard = False
    used_coordinate_fallback = False
    window_title = None

    if not prompt:
        result = build_failure(prompt, [CheckResult("prompt-non-empty", False, "Blocked: the outgoing prompt is empty.")], "Blocked: the outgoing prompt is empty.")
        return emit_result(result, 1)

    checks.append(CheckResult("prompt-non-empty", True, "Outgoing prompt is non-empty."))
    debug_log.append(f"desktop-submit helper start prompt_chars={len(prompt)}")

    try:
        window, window_confidence = find_codex_window()
        window_title = (window.window_text() or "").strip() or None
        checks.append(CheckResult("codex-window-found", True, f"Found Codex window: {window_title or 'Codex'}"))
        debug_log.append(f"codex-window-found title={window_title or 'Codex'} confidence={window_confidence:.2f}")
        checks.append(CheckResult("codex-window-visible", bool(window.is_visible()), "Codex window is visible." if window.is_visible() else "Blocked: Codex window is not visible."))
        if not window.is_visible():
            debug_log.append("codex-window-visible failed")
            return emit_result(build_failure(prompt, checks, "Blocked: Codex window is not visible.", confidence=window_confidence, window_title=window_title, debug_log=debug_log), 1)

        window.restore()
        window.set_focus()
        time.sleep(0.25)
        expected_handle = int(window.handle)
        focused_ok = current_foreground_handle() == expected_handle
        checks.append(CheckResult("codex-window-focused", focused_ok, "Codex window is focused." if focused_ok else "Blocked: Codex window focus could not be verified."))
        if not focused_ok:
            debug_log.append("codex-window-focused failed")
            return emit_result(build_failure(prompt, checks, "Blocked: Codex window focus could not be verified.", confidence=window_confidence, window_title=window_title, debug_log=debug_log), 1)

        input_surface, input_confidence = find_input_surface(window)
        checks.append(CheckResult("input-target-found", True, "Identified the Codex message input area."))
        debug_log.append(f"input-target-found confidence={input_confidence:.2f}")
        result_region_found, result_region_confidence = find_result_region(window)
        checks.append(CheckResult(
            "result-region-found",
            result_region_found,
            "Identified the Codex result region." if result_region_found else "Blocked: could not confidently identify the Codex result region."
        ))
        if not result_region_found:
            debug_log.append("result-region-found failed")
            return emit_result(build_failure(prompt, checks, "Blocked: could not confidently identify the Codex result region.", confidence=min(window_confidence, input_confidence), window_title=window_title, debug_log=debug_log), 1)

        confidence = round((window_confidence * 0.4) + (input_confidence * 0.35) + (result_region_confidence * 0.25), 3)
        confidence_ok = confidence >= CONFIDENCE_THRESHOLD
        checks.append(CheckResult(
            "confidence-threshold",
            confidence_ok,
            f"Automation confidence {confidence:.2f} passed threshold." if confidence_ok else f"Blocked: automation confidence {confidence:.2f} is below threshold."
        ))
        if not confidence_ok:
            debug_log.append(f"confidence-threshold failed confidence={confidence:.2f}")
            return emit_result(build_failure(prompt, checks, f"Blocked low-confidence desktop automation run ({confidence:.2f}).", confidence=confidence, window_title=window_title, debug_log=debug_log), 1)

        try:
            # Preserve this direct-focus path. This is the milestone behavior that lets the app
            # submit into the live Codex input without visibly moving the mouse as the primary path.
            input_surface.set_focus()
            time.sleep(0.08)
            debug_log.append("input-target-focus direct")
        except Exception:
            rect = input_surface.rectangle()
            input_surface.click_input(coords=(max(12, rect.width() // 2), max(8, rect.height() // 2)))
            used_coordinate_fallback = True
            time.sleep(0.15)
            debug_log.append("input-target-focus coordinate-fallback")

        if current_foreground_handle() != expected_handle:
            debug_log.append("focus-changed before submit")
            return emit_result(build_failure(prompt, checks, "Focus changed away from the Codex window before submit.", confidence=confidence, window_title=window_title, used_coordinate_fallback=used_coordinate_fallback, debug_log=debug_log), 1)

        set_clipboard_text(prompt)
        used_clipboard = True
        send_keys("^a", pause=0.03)
        time.sleep(0.06)
        send_keys("^v", pause=0.03, with_spaces=True)
        time.sleep(0.12)
        debug_log.append(f"prompt-injected chars={len(prompt)} clipboard={used_clipboard}")

        if current_foreground_handle() != expected_handle:
            debug_log.append("focus-changed before send")
            return emit_result(build_failure(prompt, checks, "Focus changed away from the Codex window before pressing Enter.", confidence=confidence, window_title=window_title, used_clipboard=used_clipboard, used_coordinate_fallback=used_coordinate_fallback, debug_log=debug_log), 1)

        send_keys("{ENTER}", pause=0.03)
        time.sleep(0.18)
        debug_log.append("send-triggered enter")

        reply_text, partial_capture = wait_for_codex_reply(window, prompt, expected_handle)
        debug_log.append(f"capture-complete partial={partial_capture} reply_chars={len(reply_text)}")
        result = AutomationResult(
            submitted=prompt,
            reply=reply_text,
            windowTitle=window_title,
            confidence=confidence,
            usedClipboard=used_clipboard,
            usedCoordinateFallback=used_coordinate_fallback,
            partialCapture=partial_capture,
            checks=checks,
            abortReason=None if not partial_capture else "Partial capture: the Codex response was captured before the helper could verify a fully stable result.",
            debugLog=debug_log
        )
        return emit_result(result, 0 if not partial_capture else 1)
    except Exception as error:
        debug_log.append(f"submit-aborted reason={str(error)}")
        result = build_failure(
            prompt,
            checks,
            str(error),
            window_title=window_title,
            used_clipboard=used_clipboard,
            used_coordinate_fallback=used_coordinate_fallback,
            debug_log=debug_log
        )
        return emit_result(result, 1)
    finally:
        if previous_clipboard is not None:
            set_clipboard_text(previous_clipboard)


if __name__ == "__main__":
    raise SystemExit(main())
