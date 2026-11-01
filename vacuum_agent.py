# -*- coding: utf-8 -*-
"""
vacuum_agent.py — عامل واکنشی ساده جاروبرقی در محیط 2x2

ایده اصلی (Russell & Norvig — Intelligent Agents):
    عامل واکنشی ساده = Simple Reflex Agent
    فقط بر اساس ادراک *فعلی* تصمیم می‌گیرد و هیچ حافظه‌ای از گذشته ندارد.

    قاعده کلی:
        IF وضعیت == کثیف  THEN  مکش (Suck)
        ELSE               حرکت طبق نقشه راه (محل خانه)

ساختار محیط 2x2:

            ستون 0      ستون 1
          +---------+---------+
 ردیف 0   |    A    |    B    |
          +---------+---------+
 ردیف 1   |    C    |    D    |
          +---------+---------+

    مسیر ثابت گشت‌زنی:  A --راست--> B --پایین--> D --چپ--> C --بالا--> A

ادراک (percept)      = (نام خانه، آیا کثیف است؟)
عمل‌ها (actions)     = {Suck, Up, Down, Left, Right}
معیار عملکرد (score) = (تعداد خانه‌های تمیزشده) − (تعداد کل عمل‌ها)

اجرا:  python vacuum_agent.py
"""

from __future__ import annotations

import random
from enum import Enum


# --------------------------------------------------------------------------
# 1) مجموعه عمل‌های ممکن
# --------------------------------------------------------------------------
class Action(Enum):
    SUCK = "مکش"
    UP = "بالا"
    DOWN = "پایین"
    LEFT = "چپ"
    RIGHT = "راست"

    def __str__(self) -> str:
        return self.value


# جابه‌جایی در ماتریس: (دلتای ردیف، دلتای ستون)
MOVES: dict[Action, tuple[int, int]] = {
    Action.UP: (-1, 0),
    Action.DOWN: (+1, 0),
    Action.LEFT: (0, -1),
    Action.RIGHT: (0, +1),
}


# --------------------------------------------------------------------------
# 2) جدول قواعد عامل واکنشی ساده
#    کلید = (خانه، کثیف؟)  →  مقدار = عمل
#    این جدول همان «condition → action» است؛ حافظه‌ای در کار نیست.
# --------------------------------------------------------------------------
A, B, C, D = "A", "B", "C", "D"

RULES: dict[tuple[str, bool], Action] = {
    # کثیف؟ → همیشه مکش
    (A, True): Action.SUCK,
    (B, True): Action.SUCK,
    (C, True): Action.SUCK,
    (D, True): Action.SUCK,
    # تمیز؟ → طبق نقشه راه حرکت کن
    (A, False): Action.RIGHT,   # A → B
    (B, False): Action.DOWN,    # B → D
    (D, False): Action.LEFT,    # D → C
    (C, False): Action.UP,      # C → A
}


# --------------------------------------------------------------------------
# 3) محیط (دنیا)
# --------------------------------------------------------------------------
class Environment:
    ROWS = COLS = 2
    NAMES = ((A, B), (C, D))          # نام خانه‌ها در هر (ردیف، ستون)

    def __init__(self, dirt: set[tuple[int, int]] | None = None,
                 start: tuple[int, int] = (0, 0)) -> None:
        # اگر چیزی داده نشود: A و D کثیف‌اند (مثال کلاسیک)
        self.dirt: set[tuple[int, int]] = set(dirt) if dirt is not None else {(0, 0), (1, 1)}
        self.agent_pos: tuple[int, int] = start
        self.steps = 0        # تعداد کل عمل‌های انجام‌شده
        self.cleaned = 0      # تعداد خانه‌هایی که واقعاً تمیز شدند
        self.wasted = 0       # عمل‌های بیهوده (مکش روی زمین تمیز یا برخورد با دیوار)

    # ---- ادراک: تنها چیزی که عامل می‌بیند ----
    def perceive(self) -> tuple[str, bool]:
        r, c = self.agent_pos
        return self.NAMES[r][c], (r, c) in self.dirt

    # ---- اعمال عمل انتخابی روی محیط ----
    def apply(self, action: Action) -> None:
        self.steps += 1

        if action is Action.SUCK:
            if self.agent_pos in self.dirt:
                self.dirt.remove(self.agent_pos)
                self.cleaned += 1
            else:
                self.wasted += 1                      # مکش روی زمین تمیز

        elif action in MOVES:
            dr, dc = MOVES[action]
            r, c = self.agent_pos
            nr, nc = r + dr, c + dc
            if 0 <= nr < self.ROWS and 0 <= nc < self.COLS:
                self.agent_pos = (nr, nc)
            else:
                self.wasted += 1                      # برخورد با دیوار

    # ---- معیار عملکرد ----
    @property
    def score(self) -> int:
        return self.cleaned - self.steps

    @property
    def finished(self) -> bool:
        return not self.dirt

    # ---- نمایش گرافیکی محیط ----
    def render(self) -> str:
        bar = "  +" + "+".join(["------"] * self.COLS) + "+"
        lines = [bar]
        for r in range(self.ROWS):
            top, bottom = [], []
            for c in range(self.COLS):
                pos = (r, c)
                top.append(f" {('[R]' if pos == self.agent_pos else ''):^4} ")
                bottom.append(f" {self.NAMES[r][c] + ('*' if pos in self.dirt else ''):^4} ")
            lines.append("  |" + "|".join(top) + "|")
            lines.append("  |" + "|".join(bottom) + "|")
        lines.append(bar)
        return "\n".join(lines)


# --------------------------------------------------------------------------
# 4) عامل‌ها
# --------------------------------------------------------------------------
class SimpleReflexAgent:
    """عامل واکنشی ساده: تصمیم لحظه‌ای، بدون حافظه."""

    name = "عامل واکنشی ساده"

    def decide(self, cell: str, dirty: bool) -> Action:
        return RULES[(cell, dirty)]


class RandomAgent:
    """عامل تصادفی — فقط برای مقایسه معیار عملکرد."""

    name = "عامل تصادفی"

    def decide(self, cell: str, dirty: bool) -> Action:
        if dirty:
            return Action.SUCK
        return random.choice(list(MOVES))


# --------------------------------------------------------------------------
# 5) حلقه اجرا
# --------------------------------------------------------------------------
def run(env: Environment, agent, max_steps: int = 30, verbose: bool = False) -> int:
    while env.dirt and env.steps < max_steps:
        cell, dirty = env.perceive()
        action = agent.decide(cell, dirty)
        if verbose:
            status = "کثیف" if dirty else "تمیز"
            print(f"  گام {env.steps + 1:>2} | ادراک: خانه {cell} ({status}) | عمل: {action}")
        env.apply(action)

    if verbose:
        print()
        print(env.render())
        print()
        print(f"  نتیجه: تمیزشده={env.cleaned} | عمل‌ها={env.steps} "
              f"| بیهوده={env.wasted} | امتیاز={env.score}")
        if env.dirt:
            print("  ⚠ همه خانه‌ها تمیز نشدند!")
    return env.score


# --------------------------------------------------------------------------
# 6) اجرا
# --------------------------------------------------------------------------
if __name__ == "__main__":
    import sys

    # کنسول ویندوز پیش‌فرض cp1252 است؛ خروجی فارسی را UTF-8 می‌کنیم
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    # --- نمونه اجرای کامل با توضیح قدم‌به‌قدم ---
    print("=" * 52)
    print("  اجرای نمونه: عامل واکنشی ساده در محیط 2x2")
    print("  * = خانه کثیف | [R] = موقعیت جاروبرقی")
    print("=" * 52)
    world = Environment(dirt={(0, 0), (1, 1)})       # A و D کثیف
    run(world, SimpleReflexAgent(), verbose=True)

    # --- آزمون روی همه 16 پیکربندی ممکن کثیفی ---
    print("\n" + "=" * 52)
    print("  آزمون همه 16 حالت ممکن آلودگی")
    print("=" * 52)
    print(f"  {'حالت':<8}{'کثیفی':<10}{'تمیزشده':<10}{'عمل‌ها':<8}{'امتیاز'}")
    print("  " + "-" * 44)

    reflex_scores, random_scores = [], []
    for mask in range(16):
        dirt = {(r, c) for r in range(2) for c in range(2) if mask >> (r * 2 + c) & 1}
        label = "".join(Environment.NAMES[r][c] for r, c in sorted(dirt)) or "—"

        e1 = Environment(dirt=set(dirt))
        s1 = run(e1, SimpleReflexAgent())
        reflex_scores.append(s1)

        random.seed(mask)
        e2 = Environment(dirt=set(dirt))
        s2 = run(e2, RandomAgent())
        random_scores.append(s2)

        print(f"  {mask:<8}{label:<10}{e1.cleaned:<10}{e1.steps:<8}{s1}")

    print("  " + "-" * 44)
    print(f"  میانگین امتیاز عامل واکنشی ساده : {sum(reflex_scores) / 16:.2f}")
    print(f"  میانگین امتیاز عامل تصادفی      : {sum(random_scores) / 16:.2f}")
    print("\n  نتیجه: عامل واکنشی ساده در همه حالات، همه خانه‌ها را تمیز می‌کند")
    print("         و چون بدون حافظه است، عمل‌های بیهوده‌اش حداقلی است.")
