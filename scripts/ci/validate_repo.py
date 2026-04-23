#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
喵懂仓库最小CI校验（不依赖Docker/数据库）：
- 种子数据JSON存在且结构合理
- 关键文档存在
- 仓库内不应残留旧品牌名“喵语”
"""

from __future__ import annotations

import json
import pathlib
import sys


ROOT = pathlib.Path(__file__).resolve().parents[2]
SEED = ROOT / "data" / "seed" / "miaodong-seed-v1.json"


def fail(msg: str) -> None:
    print(f"[FAIL] {msg}", file=sys.stderr)
    raise SystemExit(1)


def ok(msg: str) -> None:
    print(f"[OK] {msg}")


def read_json(path: pathlib.Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        fail(f"找不到文件：{path}")
    except json.JSONDecodeError as e:
        fail(f"JSON解析失败：{path} ({e})")


def assert_doc_exists(rel: str) -> None:
    p = ROOT / rel
    if not p.exists():
        fail(f"缺少关键文档：{rel}")
    ok(f"文档存在：{rel}")


def scan_for_legacy_brand() -> None:
    legacy = "喵语"
    # 排除 Git 历史与二进制（这里只是简单扫描文本）
    bad_hits: list[str] = []
    for p in ROOT.rglob("*"):
        if not p.is_file():
            continue
        if ".git" in p.parts:
            continue
        if p.name == "validate_repo.py":
            # 校验脚本本身包含“喵语”用于检测，不应算作残留
            continue
        # 跳过压缩包/图片等
        if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".gz", ".zip", ".tar"}:
            continue
        try:
            txt = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if legacy in txt:
            bad_hits.append(str(p.relative_to(ROOT)))
    if bad_hits:
        fail(f"发现残留品牌词“{legacy}”的文件：{bad_hits}")
    ok("未发现残留品牌词“喵语”")


def main() -> None:
    ok(f"仓库根目录：{ROOT}")

    data = read_json(SEED)
    ok("种子数据JSON可解析")

    meta = data.get("meta", {})
    if meta.get("app") != "喵懂":
        fail(f"seed meta.app 应为“喵懂”，实际为：{meta.get('app')!r}")
    ok("seed meta.app=喵懂")

    # Top3问题
    problems = data.get("problems", [])
    ids = {p.get("id") for p in problems}
    required = {"night_meow", "always_meow", "after_litter_meow"}
    if not required.issubset(ids):
        fail(f"seed problems 缺少Top3：{sorted(required - ids)}")
    ok("seed problems 包含Top3问题")

    # 增长模块优先级
    growth = data.get("growth_modules", {})
    prio = growth.get("priority_from_user", [])
    if prio[:2] != ["persona_card", "achievement_system"]:
        fail(f"增长优先级前两项应为 persona_card/achievement_system，实际：{prio[:3]}")
    ok("增长优先级结构合理")

    # 关键文档存在
    assert_doc_exists("docs/product/PRD.md")
    assert_doc_exists("docs/product/ADMIN_CONSOLE_MVP.md")
    assert_doc_exists("docs/tech/ARCHITECTURE.md")
    assert_doc_exists("docs/tech/API_CONTRACT.md")
    assert_doc_exists("docs/tech/ANALYTICS_SPEC.md")
    assert_doc_exists("docs/project/WBS_MILESTONES.md")
    assert_doc_exists("docs/project/RACI.md")
    assert_doc_exists("docs/project/RISKS.md")

    scan_for_legacy_brand()

    ok("全部校验通过")


if __name__ == "__main__":
    main()
