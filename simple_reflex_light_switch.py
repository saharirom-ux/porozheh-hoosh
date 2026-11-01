# -*- coding: utf-8 -*-
"""
عامل واکنشی ساده (Simple Reflex Agent)
مسئله: سوئیچ نور در محیط 2x2
هدف: خاموش کردن همهٔ خانه‌های روشن

قاعدهٔ شرط–عمل (Condition–Action):
    اگر نور خانهٔ فعلی روشن است  -> TURN_OFF (خاموش کن)
    وگرنه                        -> MOVE     (به خانهٔ بعدی برو)
"""

import sys
from typing import List, Tuple

# کنسول ویندوز ممکن است UTF-8 نباشد
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

GRID_SIZE = 2
MAX_STEPS = 100  # جلوگیری از حلقهٔ بی‌نهایت

# ---------------------------------------------------------------- محیط


def make_initial_state() -> List[List[bool]]:
    """محیط اولیه: True = روشن، False = خاموش"""
    return [
        [True, True],
        [True, False],
    ]


def all_lights_off(state: List[List[bool]]) -> bool:
    """آیا همهٔ خانه‌ها خاموش هستند؟ (شرط پایان)"""
    return all(not light for row in state for light in row)


def move_next(pos: Tuple[int, int]) -> Tuple[int, int]:
    """الگوی حرکت ثابت: چپ به راست، بالا به پایین (بدون حافظه)"""
    r, c = pos
    idx = (r * GRID_SIZE + c + 1) % (GRID_SIZE * GRID_SIZE)
    return idx // GRID_SIZE, idx % GRID_SIZE


# ------------------------------------------------------------ عامل


def simple_reflex_agent(percept: bool) -> str:
    """
    عامل واکنشی ساده: فقط به ادراک لحظه‌ای نگاه می‌کند.
    percept = True  -> نور روشن است
    percept = False -> نور خاموش است
    """
    if percept:
        return "TURN_OFF"
    return "MOVE"


# ------------------------------------------------------------ اجرا


def state_to_str(state: List[List[bool]]) -> str:
    return " | ".join("روشن" if light else "خاموش" for row in state for light in row)


def run() -> None:
    state = make_initial_state()
    pos = (0, 0)
    steps = 0

    print("=" * 62)
    print("   شبیه‌سازی عامل واکنشی ساده - مسئله سوئیچ نور 2x2")
    print("=" * 62)
    print(f"حالت اولیه : [{state_to_str(state)}]")
    print(f"موقعیت اولیه عامل: خانه {pos}")
    print("-" * 62)

    while not all_lights_off(state):
        if steps >= MAX_STEPS:
            print("خطا: به حد مجاز رسیدیم!")
            return

        r, c = pos
        percept = state[r][c]                 # ۱) ادراک: وضعیت نور خانهٔ فعلی
        action = simple_reflex_agent(percept)  # ۲) تصمیم: قاعده شرط–عمل

        if action == "TURN_OFF":
            state[r][c] = False               # ۳) اجرا: خاموش کردن چراغ
            result = "چراغ خاموش شد"
        else:
            pos = move_next(pos)              # ۳) اجرا: جابه‌جایی
            result = f"جابه‌جایی به خانه {pos}"

        steps += 1
        print(f"گام {steps:>2} | خانه {pos if action == 'MOVE' else (r, c)} | "
              f"ادراک: {'روشن' if percept else 'خاموش'} | "
              f"عمل: {action:<9} | {result}")
        print(f"        وضعیت محیط: [{state_to_str(state)}]")

    print("-" * 62)
    print(f"✔ هدف محقق شد! همهٔ خانه‌ها خاموش شدند در {steps} گام.")


if __name__ == "__main__":
    run()
