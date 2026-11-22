# -*- coding: utf-8 -*-
"""
عامل واکنشی مدل‌دار (Model-Based Reflex Agent)
جاروبرقی در محیط 2×2  —  مطابق معماری شکل 2.12 کتاب راسل و نوریگ

محیط (4 خانه):
    A B
    C D

اعمال:  Left, Right, Up, Down, Suck, NoOp
پرسپت:  (نام خانه فعلی، Dirty/Clean) + رویداد Bump در صورت برخورد با دیوار

تفاوت با عامل واکنشی ساده:
    این عامل یک «مدل داخلی» دارد (visited / known_dirty) و به کمک آن
    خانه‌هایی را که الان نمی‌بیند ولی کثیف می‌داند، یا هنوز اصلاً ندیده،
    در حافظه نگه می‌دارد و بر اساس همان تصمیم می‌گیرد.
"""

from collections import deque

# ------------------------------------------------------------------
# تعریف محیط
# ------------------------------------------------------------------
CELLS = {"A": (0, 0), "B": (0, 1), "C": (1, 0), "D": (1, 1)}
NAMES = {v: k for k, v in CELLS.items()}

MOVES = {
    "Up": (-1, 0),
    "Down": (1, 0),
    "Left": (0, -1),
    "Right": (0, 1),
}


class VacuumEnvironment:
    """محیط 2×2 جاروبرقی: وضعیت کثیفی خانه‌ها و قوانین حرکت."""

    def __init__(self, dirt_map):
        # dirt_map مثل: {"A": True, "B": True, "C": True, "D": False}
        self.state = dict(dirt_map)

    def percept(self, position):
        """پرسپت عامل در خانه فعلی: (نام خانه، کثیف یا تمیز)"""
        name = NAMES[position]
        return (name, "Dirty" if self.state[name] else "Clean")

    def remaining_dirt(self):
        return [n for n, dirty in self.state.items() if dirty]

    def step(self, position, action):
        """اعمال دستور عامل → (موقعیت جدید، رویداد احتمالی مانند Bump)"""
        if action == "Suck":
            self.state[NAMES[position]] = False
            return position, None

        if action == "NoOp":
            return position, None

        if action in MOVES:
            dr, dc = MOVES[action]
            nr, nc = position[0] + dr, position[1] + dc
            if not (0 <= nr < 2 and 0 <= nc < 2):
                return position, "Bump"          # دیوار!
            return (nr, nc), None

        raise ValueError("اکشن ناشناخته: %r" % action)


# ------------------------------------------------------------------
# عامل واکنشی مدل‌دار
# ------------------------------------------------------------------
class ModelBasedVacuumAgent:
    """
    حالت داخلی (مدل) عامل:
        position     : محل فعلی
        visited      : خانه‌هایی که تا حالا دیده شده‌اند
        known_dirty  : خانه‌هایی که می‌دانیم کثیف‌اند و هنوز تمیز نشده‌اند
        plan         : صف اکشن‌های باقی‌مانده برای رسیدن به هدف

    قواعد (condition → action):
        1) خانه فعلی کثیف است            → Suck
        2) برنامه حرکتی ناتمام داریم     → ادامه حرکت
        3) خانه کثیف دیگری می‌شناسیم     → رفتن به نزدیک‌ترین آن
        4) خانه‌ای هنوز دیده نشده        → رفتن به کاوش نزدیک‌ترین خانه نادیده
        5) همه خانه‌ها تمیز و دیده شده   → NoOp (کار تمام است)
    """

    def __init__(self):
        self.position = None
        self.visited = set()
        self.known_dirty = set()
        self.plan = []

    # ---------- به‌روزرسانی مدل داخلی ----------
    def update_state(self, percept):
        name, status = percept
        self.position = CELLS[name]
        self.visited.add(self.position)
        if status == "Dirty":
            self.known_dirty.add(self.position)
        else:
            self.known_dirty.discard(self.position)

    # ---------- انتخاب اکشن بر اساس مدل + قواعد ----------
    def choose_action(self, percept):
        self.update_state(percept)

        # قاعده 1: مکیدن کثیفی خانه فعلی
        if self.position in self.known_dirty:
            self.plan = []
            return "Suck"

        # قاعده 2: ادامه برنامه حرکتی
        if self.plan:
            return self.plan.pop(0)

        # قاعده 3: رفتن به نزدیک‌ترین خانه کثیف شناخته‌شده
        target = self._nearest(self.known_dirty)

        # قاعده 4: کاوش خانه‌های دیده‌نشده
        if target is None:
            unvisited = {c for c in CELLS.values() if c not in self.visited}
            target = self._nearest(unvisited)

        # قاعده 5: همه‌چیز تمام شده
        if target is None:
            return "NoOp"

        self.plan = self._path_to(target)
        return self.plan.pop(0) if self.plan else "NoOp"

    # ---------- ابزارهای کمکی تصمیم‌گیری ----------
    def _nearest(self, candidates):
        """نزدیک‌ترین خانه به محل فعلی از مجموعه داده‌شده (فاصله منهتن)"""
        if not candidates:
            return None
        r, c = self.position
        # تساوی فاصله → نام کوچک‌تر تا نتیجه همیشه قطعی باشد
        return min(candidates, key=lambda p: (abs(p[0] - r) + abs(p[1] - c), NAMES[p]))

    def _path_to(self, target):
        """کوتاه‌ترین مسیر بدون برخورد از موقعیت فعلی تا هدف (جستجوی BFS)"""
        if target == self.position:
            return []
        queue = deque([(self.position, [])])
        seen = {self.position}
        while queue:
            pos, path = queue.popleft()
            for action, (dr, dc) in MOVES.items():
                nr, nc = pos[0] + dr, pos[1] + dc
                if not (0 <= nr < 2 and 0 <= nc < 2):
                    continue
                nxt = (nr, nc)
                if nxt in seen:
                    continue
                new_path = path + [action]
                if nxt == target:
                    return new_path
                seen.add(nxt)
                queue.append((nxt, new_path))
        return []


# ------------------------------------------------------------------
# اجرای شبیه‌سازی
# ------------------------------------------------------------------
def run_simulation(dirt_map, start="A", max_steps=40, title=""):
    env = VacuumEnvironment(dirt_map)
    agent = ModelBasedVacuumAgent()
    position = CELLS[start]

    print("=" * 74)
    print("شروع شبیه‌سازی:", title)
    print("خانه‌های اولیه کثیف:", env.remaining_dirt(), "| شروع از خانه", start)
    print("=" * 74)
    print("{:<4} {:<16} {:<7} {:<9} {:<16} {}".format(
        "مرحله", "پرسپت", "اکشن", "خانه", "کثیفی باقی‌مانده", "مدل داخلی عامل"))
    print("-" * 74)

    for step in range(1, max_steps + 1):
        percept = env.percept(position)
        action = agent.choose_action(percept)
        position, event = env.step(position, action)

        dirty_left = env.remaining_dirt()
        model = "visited={} known_dirty={}".format(
            sorted(NAMES[p] for p in agent.visited),
            sorted(NAMES[p] for p in agent.known_dirty),
        )
        print("{:<4} {:<16} {:<7} {:<9} {:<16} {}".format(
            step,
            "{}/{}".format(percept[0], percept[1]),
            action + ("!" if event else ""),
            NAMES[position],
            ", ".join(dirty_left) if dirty_left else "—",
            model,
        ))

        if action == "NoOp":
            print("-" * 74)
            print("✔ تمام خانه‌ها تمیز شدند در", step - 1, "حرکت واقعی.")
            return step - 1

    print("✘ به سقف تعداد مراحل رسید.")
    return None


if __name__ == "__main__":
    # سناریوی ۱: همه خانه‌ها کثیف‌اند
    run_simulation(
        {"A": True, "B": True, "C": True, "D": True},
        title="همه خانه‌ها کثیف",
    )

    # سناریوی ۲: فقط A و C کثیف‌اند (خانه‌های B و D از ابتدا تمیز)
    run_simulation(
        {"A": True, "B": False, "C": True, "D": False},
        title="فقط ستون چپ کثیف",
    )
