# -*- coding: utf-8 -*-
"""
عامل واکنشی ساده برای مسئله جارو برقی (Vacuum Cleaner) در محیط ۲×۲
هدف عامل: خاموش کردن همه خانه‌های روشن
"""

import sys

# اطمینان از چاپ درست متن فارسی و نمادها در کنسول ویندوز
sys.stdout.reconfigure(encoding="utf-8")

ON = "روشن"
OFF = "خاموش"

DIR_NAMES = {"R": "راست", "L": "چپ", "U": "بالا", "D": "پایین"}


class Environment:
    """محیط ۲×۲؛ True یعنی خانه روشن و False یعنی خاموش."""

    def __init__(self, grid, start=(0, 0)):
        self.grid = [row[:] for row in grid]  # کپی از حالت اولیه
        self.location = start

    # ---------- مرحله ۱: حس‌پذیری ----------
    def percept(self):
        """حس فعلی عامل: وضعیت خانه‌ای که عامل روی آن ایستاده است."""
        r, c = self.location
        return ON if self.grid[r][c] else OFF

    # ---------- مرحله ۲: کنش‌ها ----------
    def turn_off(self):
        """خاموش کردن خانه فعلی."""
        r, c = self.location
        self.grid[r][c] = False

    def move(self, direction):
        """حرکت؛ اگر مقصد خارج از شبکه باشد، عامل سر جایش می‌ماند."""
        dr, dc = {"R": (0, 1), "L": (0, -1), "U": (-1, 0), "D": (1, 0)}[direction]
        r, c = self.location
        nr, nc = r + dr, c + dc
        if 0 <= nr < 2 and 0 <= nc < 2:
            self.location = (nr, nc)

    # ---------- مرحله ۶: آزمون هدف ----------
    def all_off(self):
        """آیا همه خانه‌ها خاموش شده‌اند؟"""
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


class SimpleReflexAgent:
    """عامل واکنشی ساده: فقط بر اساس حس فعلی تصمیم می‌گیرد."""

    # مرحله ۴: مسیر ثابت چرخه‌ای برای پوشش کامل شبکه
    ROUTE = ["R", "D", "L", "U"]  # راست ← پایین ← چپ ← بالا

    def __init__(self):
        self.route_index = 0

    # مرحله ۳: قواعد IF–THEN
    def decide(self, percept):
        # قانون ۱ (قانون هدف): خانه روشن است → خاموشش کن
        if percept == ON:
            return "turn_off", None
        # قانون ۲: خانه خاموش است → طبق مسیر ثابت حرکت کن
        direction = self.ROUTE[self.route_index % len(self.ROUTE)]
        self.route_index += 1
        return "move", direction


def run():
    # حالت اولیه: سه خانه روشن، خانه (1,0) از اول خاموش است
    env = Environment(grid=[[True, True],
                            [False, True]])
    agent = SimpleReflexAgent()

    print("حالت اولیه (☀ = روشن، · = خاموش، [ ] = عامل):")
    print(env.show())
    print("-" * 40)

    # مرحله ۵: حلقه اجرا تا محقق شدن هدف
    steps = 0
    while not env.all_off() and steps < 50:
        steps += 1
        percept = env.percept()                 # حس‌گیری
        action, param = agent.decide(percept)   # تصمیم با قانون

        if action == "turn_off":
            env.turn_off()
            desc = "خاموش کردن خانهٔ فعلی"
        else:
            env.move(param)
            desc = f"حرکت به {DIR_NAMES[param]}"

        print(f"گام {steps} | حس: {percept} | کنش: {desc}")
        print(env.show())
        print("-" * 40)

    print(f"\n✔ هدف محقق شد: همه خانه‌ها خاموش شدند. تعداد گام‌ها = {steps}")


if __name__ == "__main__":
    run()
