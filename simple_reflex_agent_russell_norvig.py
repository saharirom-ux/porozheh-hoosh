# -*- coding: utf-8 -*-
"""
عامل واکنشی ساده — عیناً طبق بخش «Simple Reflex Agents» کتاب
Russell & Norvig (AIMA) — فصل ۲ (Intelligent Agents)

ویژگی‌هایی که طبق کتاب رعایت شده:
  ۱) ادراک فعلی (percept) = (مکان، وضعیت خانه)  ← محیط کاملاً قابل مشاهده (fully observable)
  ۲) مجموعه‌ای از «قواعد شرط–عمل» (Condition–Action Rules) — جدول ۸ قاعده‌ای زیر
  ۳) هیچ حافظه یا حالت داخلی‌ای ندارد:  action = f(percept فعلی)

چیدمان محیط ۲×۲ (مانند مثال ۴-محله‌ای کتاب):

            ستون 0      ستون 1
          +---------+---------+
   ردیف 0 |    A    |    B    |   مسیر گشت‌زنی:  A ←راست← B
          +---------+                     ↓
   ردیف 1 |    C    |    D    |          D ←چپ← C
          +---------+                     ↑
                                          └ (بالا از C به A)

نام‌گذاری مکان‌ها:  A=(0,0)  B=(0,1)  C=(1,0)  D=(1,1)
"""
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ON = "روشن"
OFF = "خاموش"

# نام مکان‌ها طبق شکل بالا
LOCATION_NAMES = {(0, 0): "A", (0, 1): "B", (1, 0): "C", (1, 1): "D"}

DIR_NAMES = {"right": "راست", "left": "چپ", "up": "بالا", "down": "پایین"}


# ------------------------------------------------------------------ محیط
class Environment:
    """محیط ۲×۲؛ True = خانه روشن، False = خانه خاموش."""

    def __init__(self, grid, start=(0, 0)):
        self.grid = [row[:] for row in grid]
        self.location = start

    def percept(self):
        """ادراک فعلی عامل = (نام مکان، وضعیت خانه)."""
        r, c = self.location
        return LOCATION_NAMES[(r, c)], self.grid[r][c]

    def turn_off(self):
        r, c = self.location
        self.grid[r][c] = False

    def move(self, direction):
        dr, dc = {"right": (0, 1), "left": (0, -1), "up": (-1, 0), "down": (1, 0)}[direction]
        r, c = self.location
        nr, nc = r + dr, c + dc
        if 0 <= nr < 2 and 0 <= nc < 2:
            self.location = (nr, nc)

    def all_off(self):
        return all(not cell for row in self.grid for cell in row)

    def show(self):
        lines = []
        for r in range(2):
            row = []
            for c in range(2):
                mark = "☀" if self.grid[r][c] else "·"
                row.append(f"[{mark}]" if (r, c) == self.location else f" {mark} ")
            lines.append(" ".join(row))
        return "\n".join(lines)


# ------------------------------------------------- عامل واکنشی ساده (کتاب)
class SimpleReflexAgent:
    """
    جدول قواعد شرط–عمل (table lookup) — دقیقاً همان چیزی که کتاب
    در بخش Simple Reflex Agent می‌گوید:
        IF شرط برقرار است THEN کنش معادل
    خبری از شمارنده، حافظه یا وضعیت داخلی نیست.
    """

    RULES = {
        # ----- مکان A -----
        ("A", True):  ("turn_off", None),    # IF location=A و روشن است  THEN خاموش کن
        ("A", False): ("move", "right"),     # IF location=A و خاموش است THEN برو به راست (B)
        # ----- مکان B -----
        ("B", True):  ("turn_off", None),    # IF location=B و روشن است  THEN خاموش کن
        ("B", False): ("move", "down"),      # IF location=B و خاموش است THEN برو به پایین (D)
        # ----- مکان D -----
        ("D", True):  ("turn_off", None),    # IF location=D و روشن است  THEN خاموش کن
        ("D", False): ("move", "left"),      # IF location=D و خاموش است THEN برو به چپ (C)
        # ----- مکان C -----
        ("C", True):  ("turn_off", None),    # IF location=C و روشن است  THEN خاموش کن
        ("C", False): ("move", "up"),        # IF location=C و خاموش است THEN برو به بالا (A)
    }

    def decide(self, percept):
        """فقط کافی است percept فعلی را در جدول جست‌وجو کند (بدون هیچ state)."""
        location, is_on = percept
        return self.RULES[(location, is_on)]


# ------------------------------------------------------------------ اجرا
def run():
    env = Environment(grid=[[True, True],
                            [False, True]])   # خانه C از ابتدا خاموش است
    agent = SimpleReflexAgent()

    print("حالت اولیه (☀ = روشن، · = خاموش، [ ] = عامل):")
    print(env.show())
    print("-" * 44)

    steps = 0
    while not env.all_off() and steps < 50:
        steps += 1
        percept = env.percept()
        action, param = agent.decide(percept)

        if action == "turn_off":
            env.turn_off()
            desc = "خاموش کردن خانهٔ فعلی"
        else:
            env.move(param)
            desc = f"حرکت به {DIR_NAMES[param]}"

        loc, state = percept
        print(f"گام {steps} | ادراک: ({loc}, {'روشن' if state else 'خاموش'}) | کنش: {desc}")
        print(env.show())
        print("-" * 44)

    print(f"\n✔ هدف محقق شد: همه خانه‌ها خاموش شدند. تعداد گام‌ها = {steps}")


if __name__ == "__main__":
    run()
