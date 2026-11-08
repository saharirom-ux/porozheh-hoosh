# -*- coding: utf-8 -*-
"""
عامل واکنشی ساده — «مرتب‌سازی اقلام بر اساس وزن (از کوچک به بزرگ)»
محیط: خطی، با ۱۰ جرم مفروض
بر اساس بخش Simple Reflex Agents کتاب Russell & Norvig (AIMA) — فصل ۲

ویژگی‌های طبق کتاب:
  ۱) ادراک فعلی (percept) = (مکان، جهت حرکت، وزن خانهٔ فعلی، وزن خانهٔ بعدی | انتهای خط)
     ← محیط کاملاً قابل مشاهده؛ عامل فقط ادراک لحظه‌ای را می‌بیند
  ۲) قواعد شرط–عمل (Condition–Action Rules) — بدون حافظه: action = f(percept)

قواعد شرط–عمل:
    IF در انتهای خط                       THEN TURN  (برگشت به جهت مقابل)
    ELSE IF جهت=راست و فعلی > بعدی         THEN SWAP  (جابه‌جایی دو همسایه)
    ELSE IF جهت=چپ  و فعلی < بعدی          THEN SWAP  (جابه‌جایی دو همسایه)
    ELSE                                    THEN MOVE  (یک قدم در جهت حرکت)

این رفتار معادل «مرتب‌سازی حبابی دوطرفه» (Cocktail Shaker Sort) است که فقط با
ادراک محلی (دو خانهٔ مجاور) کار می‌کند — یعنی عامل هرگز کل لیست را نمی‌بیند.

آزمون هدف (بیرون از عامل): آیا همه اقلام از کوچک به بزرگ مرتب شده‌اند؟
"""
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# ۱۰ جرم مفروظ (واحد: گرم) — برای تغییر مسئله همین را ویرایش کنید
MASSES = [42, 15, 78, 5, 33, 60, 21, 88, 12, 50]

MAX_STEPS = 5000          # جلوگیری از حلقهٔ بی‌نهایت
RIGHT, LEFT = 1, -1
DIR_FA = {RIGHT: "راست", LEFT: "چپ"}


# ------------------------------------------------------------------ محیط
class Environment:
    """محیط خطی با ۱۰ خانه؛ هر خانه یک جرم (وزن) دارد."""

    def __init__(self, masses, start=0, direction=RIGHT):
        self.weights = list(masses)
        self.pos = start                 # مکان عامل در خط
        self.direction = direction       # جهت حرکت: راست یا چپ
        self.swaps = 0
        self.moves = 0
        self.turns = 0

    # ---------- ادراک ----------
    def percept(self):
        """ادراک فعلی = (مکان، جهت، وزن فعلی، وزن خانهٔ بعدی | انتهای خط بودن)"""
        cur = self.weights[self.pos]
        nxt_pos = self.pos + self.direction
        if 0 <= nxt_pos < len(self.weights):
            return self.pos, self.direction, cur, self.weights[nxt_pos], False
        return self.pos, self.direction, cur, None, True

    # ---------- کنش‌ها ----------
    def move(self):
        self.pos += self.direction
        self.moves += 1

    def swap(self):
        j = self.pos + self.direction
        self.weights[self.pos], self.weights[j] = self.weights[j], self.weights[self.pos]
        self.swaps += 1

    def turn(self):
        self.direction = -self.direction
        self.turns += 1

    # ---------- آزمون هدف (بیرون از عامل) ----------
    def is_sorted(self):
        return all(self.weights[i] <= self.weights[i + 1]
                   for i in range(len(self.weights) - 1))

    def show(self):
        cells = []
        for i, w in enumerate(self.weights):
            cells.append(f"[{w:>3}]" if i == self.pos else f" {w:>3} ")
        return " ".join(cells)


# -------------------------------------------- عامل واکنشی ساده (سبک کتاب)
class SimpleReflexAgent:
    """
    قواعد شرط–عمل — تصمیم فقط بر اساس percept فعلی (بدون حافظه).
    نکته: جهت حرکت بخشی از ادراک است، پس عامل همچنان خالص واکنشی می‌ماند.
    """

    def decide(self, percept):
        pos, direction, cur, nxt, at_end = percept

        # قانون ۱: انتهای خط است → بگرد
        if at_end:
            return "turn"

        # قانون ۲: دو خانهٔ مجاور در جهت حرکت نامرتب‌اند → جابه‌جایی
        if direction == RIGHT and cur > nxt:
            return "swap"
        if direction == LEFT and cur < nxt:
            return "swap"

        # قانون ۳: مرتب است → یک قدم جلو
        return "move"


# ------------------------------------------------------------------ اجرا
def run():
    env = Environment(MASSES, start=0, direction=RIGHT)
    agent = SimpleReflexAgent()

    print(f"حالت اولیه ({len(MASSES)} جرم، پرانتز = عامل):")
    print(" " + env.show())
    print("-" * 78)

    steps = 0
    while not env.is_sorted() and steps < MAX_STEPS:
        steps += 1
        percept = env.percept()
        pos, direction, cur, nxt, at_end = percept
        action = agent.decide(percept)

        if action == "swap":
            env.swap()
            desc = f"SWAP (جابه‌جایی {cur} و {nxt})"
        elif action == "move":
            env.move()
            desc = "MOVE (یک قدم)"
        else:
            env.turn()
            desc = f"TURN (برگشت به {DIR_FA[env.direction]})"

        if at_end:
            percept_txt = f"مکان {pos}، انتهای خط، جهت {DIR_FA[direction]}"
        else:
            op = ">" if cur > nxt else ("<" if cur < nxt else "=")
            percept_txt = f"مکان {pos}، {cur} {op} {nxt}، جهت {DIR_FA[direction]}"

        print(f"گام {steps} | ادراک: ({percept_txt}) | کنش: {desc}")

    print("-" * 78)
    print("وضعیت نهایی:")
    print(" " + env.show())
    print(f"\n✔ هدف محقق شد: لیست از کوچک به بزرگ مرتب شد.")
    print(f"   نتیجه: {env.weights}")
    print(f"   گام‌ها={steps} | جابه‌جایی‌ها={env.swaps} | حرکت‌ها={env.moves} | برگشت‌ها={env.turns}")


if __name__ == "__main__":
    run()
