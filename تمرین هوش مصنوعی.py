# عامل واکنشی ساده برای مسئله خاموش کردن چراغ‌ها در محیط 2*2

# ---------- 1) تعریف محیط ----------
# ON = True یعنی چراغ روشن، OFF = False یعنی خاموش
environment = [
    [True,  False],   # خانه (0,0) روشن، (0,1) خاموش
    [True,  True ],   # خانه (1,0) و (1,1) روشن
]

SIZE = 2


def percept(environment, position):
    """ادراک: عامل فقط وضعیت خانه فعلی را می‌بیند."""
    r, c = position
    return environment[r][c]


def reflex_agent_rules(percept_value):
    """قواعد شرط–عمل ساده واکنشی:
       اگر چراغ روشن است -> خاموش کن، در غیر این صورت -> هیچ کاری نکن."""
    if percept_value:
        return "TURN_OFF"
    else:
        return "DO_NOTHING"


def act(environment, position, action):
    """اجرای عمل روی محیط."""
    r, c = position
    if action == "TURN_OFF":
        environment[r][c] = False


def all_lights_off(environment):
    """آزمون هدف: آیا همه خانه‌ها خاموش شده‌اند؟"""
    return all(not cell for row in environment for cell in row)


def print_environment(environment, step=None):
    tag = f"گام {step}: " if step is not None else ""
    print(tag)
    for row in environment:
        print("  | " + " | ".join("ON " if cell else "OFF" for cell in row) + " |")
    print()


# ---------- حلقه عامل–محیط ----------
def run_agent(environment):
    positions = [(r, c) for r in range(SIZE) for c in range(SIZE)]  # پیمایش ثابت 4 خانه
    step = 0

    print_environment(environment, "وضعیت اولیه")

    # تا زمانی که هدف محقق نشده، عامل ادراک–تصمیم–عمل را تکرار می‌کند
    while not all_lights_off(environment):
        for position in positions:
            p = percept(environment, position)          # 2) ادراک
            action = reflex_agent_rules(p)              # 3) قاعده شرط–عمل
            act(environment, position, action)          # 4) اجرا
            step += 1
            print(f"گام {step}: خانه{position} -> ادراک={'ON' if p else 'OFF'}, "
                  f"عمل={action}")

        if all_lights_off(environment):                 # 5) آزمون هدف
            break

    print("\nهدف محقق شد: همه خانه‌ها خاموش هستند!")
    print_environment(environment, "وضعیت نهایی")


if __name__ == "__main__":
    run_agent(environment)
