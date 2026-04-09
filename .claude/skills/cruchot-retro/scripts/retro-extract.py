#!/usr/bin/env python3
"""Extract productivity digest from Claude Code JSONL sessions.

Usage: python3 scripts/retro-extract.py [sessions_dir]
Default sessions_dir: ~/.claude/projects/-Users-recarnot-dev-claude-desktop-multi-llm/
"""
import json
import sys
import os
import glob
from collections import Counter, defaultdict
from datetime import datetime


def parse_session(filepath: str) -> dict | None:
    """Parse one JSONL session file into a compact summary."""
    session_id = os.path.basename(filepath).replace(".jsonl", "")
    entries = []

    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                continue

    if not entries:
        return None

    # Basic metadata
    timestamps = [e.get("timestamp") for e in entries if e.get("timestamp")]
    if not timestamps:
        return None

    timestamps_dt = []
    for ts in timestamps:
        try:
            timestamps_dt.append(datetime.fromisoformat(ts.replace("Z", "+00:00")))
        except (ValueError, AttributeError):
            pass

    if not timestamps_dt:
        return None

    start = min(timestamps_dt)
    end = max(timestamps_dt)
    duration_min = round((end - start).total_seconds() / 60, 1)
    date = start.strftime("%Y-%m-%d")
    git_branch = None

    # Count messages and tools
    user_msgs = 0
    assistant_msgs = 0
    tools = Counter()
    tool_errors = Counter()
    user_rejections = 0
    skills_used = set()

    # Friction detection
    consecutive_tool_fails = 0
    last_tool_name = None
    last_tool_failed = False
    retry_loops = 0
    reverts_detected = 0
    same_file_edits = Counter()
    interruptions = 0
    last_assistant_length = 0

    for entry in entries:
        etype = entry.get("type")

        if etype == "user":
            msg = entry.get("message", "")
            if isinstance(msg, dict):
                content = msg.get("content", "")
                # Check for tool_result errors (is_error: true)
                if isinstance(content, list):
                    for block in content:
                        if (
                            isinstance(block, dict)
                            and block.get("type") == "tool_result"
                            and block.get("is_error")
                        ):
                            error_content = str(block.get("content", "")).lower()
                            error_type = "other"
                            if (
                                "not found" in error_content
                                or "no such file" in error_content
                            ):
                                error_type = "file_not_found"
                            elif (
                                "exit code" in error_content
                                or "command failed" in error_content
                                or "non-zero" in error_content
                            ):
                                error_type = "command_failed"
                            elif (
                                "not unique" in error_content
                                or "old_string" in error_content
                                or "edit failed" in error_content
                            ):
                                error_type = "edit_failed"
                            elif (
                                "too large" in error_content
                                or "exceeds" in error_content
                            ):
                                error_type = "file_too_large"
                            elif (
                                "has not been read" in error_content
                                or "read it first" in error_content
                            ):
                                error_type = "write_before_read"
                            elif (
                                "rejected" in error_content
                                or "denied" in error_content
                            ):
                                error_type = "user_rejected"
                                user_rejections += 1
                            tool_errors[error_type] += 1
                            last_tool_failed = True

            if not entry.get("isMeta"):
                user_msgs += 1
                # Short user text message after long assistant = possible redirection
                # Only count actual typed text, not tool_results
                if isinstance(msg, dict):
                    content = msg.get("content", "")
                    if isinstance(content, str):
                        msg_len = len(content)
                    elif isinstance(content, list):
                        # Sum text blocks only (not tool_results)
                        msg_len = sum(
                            len(b.get("text", ""))
                            for b in content
                            if isinstance(b, dict) and b.get("type") == "text"
                        )
                    else:
                        msg_len = 0
                elif isinstance(msg, str):
                    msg_len = len(msg)
                else:
                    msg_len = 0
                # Higher threshold: < 5 chars = real interruptions ("ok", "go", "c")
                if msg_len > 0 and msg_len < 5 and last_assistant_length > 800:
                    interruptions += 1
                last_assistant_length = 0

        elif etype == "assistant":
            assistant_msgs += 1
            msg = entry.get("message", {})
            content = []

            if isinstance(msg, dict):
                content = msg.get("content", [])
            elif isinstance(msg, str):
                # Sometimes message is a stringified list
                if msg.startswith("["):
                    try:
                        content = json.loads(msg)
                    except json.JSONDecodeError:
                        content = []
                last_assistant_length = len(msg)

            if isinstance(content, list):
                text_len = 0
                for block in content:
                    if not isinstance(block, dict):
                        continue

                    if block.get("type") == "tool_use":
                        tool_name = block.get("name", "unknown")
                        tools[tool_name] += 1

                        # Track skills
                        if tool_name == "Skill":
                            inp = block.get("input", {})
                            if isinstance(inp, dict):
                                skills_used.add(inp.get("skill", "unknown"))

                        # Track edits on same file
                        if tool_name == "Edit":
                            inp = block.get("input", {})
                            if isinstance(inp, dict):
                                fp = inp.get("file_path", "")
                                if fp:
                                    # Normalize to basename for readability
                                    same_file_edits[fp] += 1

                        # Track bash for reverts
                        if tool_name == "Bash":
                            inp = block.get("input", {})
                            if isinstance(inp, dict):
                                cmd = inp.get("command", "")
                                if any(
                                    kw in cmd
                                    for kw in [
                                        "git revert",
                                        "git reset --hard",
                                        "git checkout -- ",
                                    ]
                                ):
                                    reverts_detected += 1

                        # Consecutive fail detection
                        if tool_name == last_tool_name and last_tool_failed:
                            consecutive_tool_fails += 1
                            if consecutive_tool_fails >= 2:
                                retry_loops += 1
                                consecutive_tool_fails = 0
                        else:
                            consecutive_tool_fails = 0
                        last_tool_name = tool_name
                        last_tool_failed = False

                    elif block.get("type") == "text":
                        text_len += len(block.get("text", ""))

                last_assistant_length = text_len

        elif etype == "progress":
            # Progress entries carry subagent/hook info but errors
            # are in user tool_result entries (handled above)
            pass

        # Git branch (first seen)
        if not git_branch and entry.get("gitBranch"):
            git_branch = entry["gitBranch"]

    # Friction: files edited 4+ times = painful iteration
    painful_edits = {f: c for f, c in same_file_edits.items() if c >= 4}

    return {
        "id": session_id,
        "date": date,
        "duration_min": duration_min,
        "user_msgs": user_msgs,
        "assistant_msgs": assistant_msgs,
        "tools": dict(tools.most_common(10)),
        "tool_errors": dict(tool_errors) if tool_errors else {},
        "user_rejections": user_rejections,
        "skills_used": sorted(skills_used),
        "git_branch": git_branch,
        "friction": {
            "retry_loops": retry_loops,
            "reverts": reverts_detected,
            "interruptions": interruptions,
            "painful_edits": painful_edits,
        },
    }


def aggregate(sessions: list[dict]) -> dict:
    """Aggregate across all sessions."""
    all_tools = Counter()
    all_errors = Counter()
    all_skills = Counter()
    total_user_msgs = 0
    total_rejections = 0
    total_retry_loops = 0
    total_reverts = 0
    total_interruptions = 0
    durations = []
    painful_files = Counter()
    sessions_by_date = defaultdict(int)

    for s in sessions:
        for tool, count in s["tools"].items():
            all_tools[tool] += count
        for err, count in s["tool_errors"].items():
            all_errors[err] += count
        for skill in s["skills_used"]:
            all_skills[skill] += 1
        total_user_msgs += s["user_msgs"]
        total_rejections += s["user_rejections"]
        total_retry_loops += s["friction"]["retry_loops"]
        total_reverts += s["friction"]["reverts"]
        total_interruptions += s["friction"]["interruptions"]
        if s["duration_min"] > 0:
            durations.append(s["duration_min"])
        for f, c in s["friction"]["painful_edits"].items():
            painful_files[f] += c
        sessions_by_date[s["date"]] += 1

    # Days with most sessions
    busiest_days = sorted(sessions_by_date.items(), key=lambda x: x[1], reverse=True)[
        :5
    ]

    return {
        "top_tools": all_tools.most_common(15),
        "top_tool_errors": all_errors.most_common(10),
        "skills_usage": all_skills.most_common(20),
        "total_user_msgs": total_user_msgs,
        "rejection_count": total_rejections,
        "rejection_rate": round(total_rejections / max(total_user_msgs, 1), 4),
        "avg_session_duration_min": round(
            sum(durations) / max(len(durations), 1), 1
        ),
        "median_session_duration_min": (
            round(sorted(durations)[len(durations) // 2], 1) if durations else 0
        ),
        "busiest_days": busiest_days,
        "friction_totals": {
            "retry_loops": total_retry_loops,
            "reverts": total_reverts,
            "interruptions": total_interruptions,
            "painful_edit_files": painful_files.most_common(15),
        },
        "sessions_with_high_friction": [
            {
                "id_short": s["id"][:8],
                "date": s["date"],
                "score": (
                    s["friction"]["retry_loops"]
                    + s["friction"]["reverts"] * 2
                    + s["friction"]["interruptions"]
                    + len(s["friction"]["painful_edits"]) * 2
                ),
                "retry_loops": s["friction"]["retry_loops"],
                "reverts": s["friction"]["reverts"],
                "interruptions": s["friction"]["interruptions"],
                "painful_edits_count": len(s["friction"]["painful_edits"]),
            }
            for s in sorted(
                sessions,
                key=lambda x: (
                    x["friction"]["retry_loops"]
                    + x["friction"]["reverts"] * 2
                    + x["friction"]["interruptions"]
                    + len(x["friction"]["painful_edits"]) * 2
                ),
                reverse=True,
            )[:15]
        ],
    }


def main():
    default_dir = os.path.expanduser(
        "~/.claude/projects/-Users-recarnot-dev-claude-desktop-multi-llm"
    )
    sessions_dir = sys.argv[1] if len(sys.argv) > 1 else default_dir

    if not os.path.isdir(sessions_dir):
        print(json.dumps({"error": f"Directory not found: {sessions_dir}"}))
        sys.exit(1)

    # Only main session files, not subagent JSONL
    files = sorted(glob.glob(os.path.join(sessions_dir, "*.jsonl")))

    if not files:
        print(json.dumps({"error": "No JSONL files found"}))
        sys.exit(1)

    # Parse all sessions
    sessions = []
    parse_errors = 0
    for f in files:
        result = parse_session(f)
        if result:
            sessions.append(result)
        else:
            parse_errors += 1

    # Sort by date
    sessions.sort(key=lambda x: x["date"])

    # Build output
    dates = [s["date"] for s in sessions]
    output = {
        "meta": {
            "sessions": len(sessions),
            "parse_errors": parse_errors,
            "date_range": [dates[0], dates[-1]] if dates else [],
            "total_user_msgs": sum(s["user_msgs"] for s in sessions),
            "total_assistant_msgs": sum(s["assistant_msgs"] for s in sessions),
            "extracted_at": datetime.now().isoformat()[:19],
        },
        "per_session": sessions,
        "aggregated": aggregate(sessions),
    }

    json.dump(output, sys.stdout, indent=2, ensure_ascii=False)
    print()  # trailing newline


if __name__ == "__main__":
    main()
