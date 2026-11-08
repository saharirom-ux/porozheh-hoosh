# -*- coding: utf-8 -*-
"""
عامل واکنشی ساده — «مسئله کنترل دما» در محیط ۲ خانه‌ای
بر اساس بخش Simple Reflex Agents کتاب Russell & Norvig (AIMA) — فصل ۲

ویژگی‌های طبق کتاب:
  ۱) ادراک فعلی (percept) = (خانه، دمای فعلی همان خانه)  ← محیط کاملاً قابل مشاهده
  ۲) مجموعه «قواعد شرط–عمل» (Condition–Action Rules) به صورت جدول lookup
  ۳) بدون هیچ حافظه یا حالت داخلی:   action = f(percept فعلی)

داده‌های مسئله:
  خانهٔ ۰ → دمای اولیه ۱۷ درجه (سردتر از بازهٔ آسایش)
  خانهٔ ۱ → دمای اولیه ۲۴ درجه (گرم‌تر از بازهٔ آسایش)
  عامل از «خانهٔ ۰» شروع می‌کند
  بازهٔ آسایش: ۲۰ تا ۲۲ درجه  (T_MIN … T_MAX — قابل تغییر)

کنش‌ها:   HEAT (گرم کردن)  |  COOL (سرد کردن)  |  MOVE (جابه‌جایی به خانهٔ دیگر)
تکامل دما: هر HEAT/COOL در هر گام، دمای خانهٔ فعلی را ۱ درجه تغییر می‌دهد

    اگر دما < ۲۰  → سرد است  → HEAT
    اگر دما > ۲۲  → گرم است  → COOL
    اگر ۲۰ ≤ دما ≤ ۲۲ → آسایش → MOVE (برو خانهٔ دیگر را چک کن)
"""
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

T_MIN = 20          # کف بازهٔ آسایش
T_MAX = 22          # سقف بازهٔ آسایش
TEMP_STEP = 1       # تغییر دما در هر گام HEAT/COOL
MAX_STEPS = 50      # جلوگیری از حلقهٔ بی‌نهایت

COLD = "cold"
HOT = "hot"
COMFORT = "comfortable"

STATE_FA = {COLD: "سرد", HOT: "گرم", COMFORT: "آسایش"}
ACTION_FA = {"heat": "گرم کردن (HEAT)",
             "cool": "سرد کردن (COOL)",
             "move": "جابه‌جایی"}


# ------------------------------------------------------------------ محیط
class Environment:
    """محیط ۲ خانه‌ای: خانهٔ ۰ و خانهٔ ۱؛ هر خانه یک دما دارد."""

    def __init__(self, temps, start=0):
        self.temps = list(temps)        # مثال: [17, 24]
        self.location = start           # «ذره/خانهٔ ۰» ← شروع از خانهٔ ۰

    # ---------- ادراک ----------
    def percept(self):
        """ادراک فعلی = (خانه، دمای همان خانه) — درست مثل percept در کتاب."""
        return self.location, self.temps[self.location]

    # ---------- کنش‌ها ----------
    def heat(self):
        self.temps[self.location] += TEMP_STEP

    def cool(self):
        self.temps[self.location] -= TEMP_STEP

    def move(self):
        self.location = 1 - self.location     # در محیط ۲ خانه‌ای: خانهٔ دیگر

    # ---------- آزمون هدف (بیرون از عامل، طبق کتاب) ----------
    def goal_reached(self):
        return all(T_MIN <= t <= T_MAX for t in self.temps)

    def show(self):
        cells = []
        for i, t in enumerate(self.temps):
            cells.append(f"[{t}°]" if i == self.location else f" {t}° ")
        return "خانه ۰ / خانه ۱:  " + "  ".join(cells)


# -------------------------------------------- عامل واکنشی ساده (سبک کتاب)
class SimpleReflexAgent:
    """
    جدول قواعد شرط–عمل — table lookup روی percept:
        IF شرط THEN کنش
    بدون شمارنده، بدون حافظه: فقط (خانه، وضعیت دما) را در جدول جست‌وجو می‌کند.
    """

    RULES = {
        # ----- خانهٔ ۰ -----
        ("0", COLD):    ("heat", None),   # IF خانه=۰ و سرد    THEN HEAT
        ("0", HOT):     ("cool", None),   # IF خانه=۰ و گرم    THEN COOL
        ("0", COMFORT): ("move", None),   # IF خانه=۰ و آسایش  THEN MOVE به خانهٔ ۱
        # ----- خانهٔ ۱ -----
        ("1", COLD):    ("heat", None),   # IF خانه=۱ و سرد    THEN HEAT
        ("1", HOT):     ("cool", None),   # IF خانه=۱ و گرم    THEN COOL
        ("1", COMFORT): ("move", None),   # IF خانه=۱ و آسایش  THEN MOVE به خانهٔ ۰
    }

    @staticmethod
    def categorize(temp):
        if temp < T_MIN:
            return COLD
        if temp > T_MAX:
            return HOT
        return COMFORT

    def decide(self, percept):
        room, temp = percept
        return self.RULES[(str(room), self.categorize(temp))]


# ------------------------------------------------------------------ اجرا
def run():
    env = Environment(temps=[17, 24], start=0)   # دمای اولیه و شروع از خانهٔ ۰
    agent = SimpleReflexAgent()

    print("حالت اولیه (پرانتز = عامل):")
    print(env.show())
    print("-" * 60)

    steps = 0
    while not env.goal_reached() and steps < MAX_STEPS:
        steps += 1
        room_before = env.location
        percept = env.percept()
        action, _ = agent.decide(percept)

        if action == "heat":
            env.heat()
            desc = ACTION_FA["heat"]
        elif action == "cool":
            env.cool()
            desc = ACTION_FA["cool"]
        else:
            env.move()
            desc = f"{ACTION_FA['move']} به خانهٔ {env.location}"

        room, temp = percept
        state = STATE_FA[agent.categorize(temp)]
        print(f"گام {steps} | ادراک: (خانهٔ {room}، {temp}°، {state}) | کنش: {desc}")
        print("        " + env.show())
        print("-" * 60)

    print(f"\n✔ هدف محقق شد: هر دو خانه در بازهٔ آسایش {T_MIN}–{T_MAX} درجه‌اند.")
    print(f"   دمای نهایی → خانهٔ ۰: {env.temps[0]}° | خانهٔ ۱: {env.temps[1]}°")
    print(f"   تعداد گام‌ها = {steps}")


if __name__ == "__main__":
    run()
