# Utility-based agent for a flight / train / bus / hotel booking system
# (Russell & Norvig, AIMA chapter 2, section 2.7 - Utility-Based Agents)

def utility_function(option, preferences):
    # how happy the user will be with this option (utility = happiness)
    if option["price"] > preferences["budget"]:
        return -1  # over the budget, not acceptable
    # cheaper price is better (0..5): price = budget -> 0, price = 0 -> 5
    price = 5 * (preferences["budget"] - option["price"]) / preferences["budget"]
    comfort = option["comfort"]                               # comfort of travel (1-5)
    return round(price + comfort, 2)                          # 0..10


def recommend(options, preferences):
    # pick the option with the highest utility
    best_option = None
    best_utility = -1
    for option in options:
        u = utility_function(option, preferences)
        if u > best_utility:
            best_utility = u
            best_option = option
    return best_option, best_utility


# list of available options: price and comfort of travel (1=hard, 5=easy)
options = [
    {"name": "Flight Tehran-Shiraz",   "kind": "flight", "price": 90, "comfort": 5},
    {"name": "Train Tehran-Shiraz",    "kind": "train",  "price": 40, "comfort": 4},
    {"name": "Bus Tehran-Shiraz",      "kind": "bus",    "price": 20, "comfort": 2},
    {"name": "Flight Tehran-Tabriz",   "kind": "flight", "price": 75, "comfort": 5},
    {"name": "Hotel Espinas",          "kind": "hotel",  "price": 60, "comfort": 5},
    {"name": "Hotel Parsian",          "kind": "hotel",  "price": 35, "comfort": 3},
    {"name": "Hotel Apamea",           "kind": "hotel",  "price": 25, "comfort": 2},
]

print("Available options (price / comfort):")
for o in options:
    print(f"  {o['name']} [{o['kind']}]: {o['price']} / {o['comfort']}")

# the preferences stated by the user (like input() in the reference file)
preferences = {
    "budget": int(input("\nEnter your budget (max price): ")),
}

print("\nUtilities:")
for o in options:
    print(f"  {o['name']}: {utility_function(o, preferences)}")

best, best_utility = recommend(options, preferences)
if best is None:
    print("\nNo option inside your budget found")
else:
    print(f"\nBest option: {best['name']} (utility = {best_utility})")
