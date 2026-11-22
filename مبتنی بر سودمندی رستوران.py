# Utility-based agent for a restaurant recommender
# (Russell & Norvig, AIMA chapter 2, section 2.7 - Utility-Based Agents)

def utility_function(restaurant, preferences):
    # how happy the user will be with this restaurant (utility = happiness)
    if restaurant["quality"] < preferences["min_quality"]:
        return -1  # below the minimum quality, not acceptable
    quality = restaurant["quality"]                             # 1..5
    price = 5 - abs(restaurant["price"] - preferences["price"]) # closest price is best
    location = 5 if restaurant["location"] == preferences["location"] else 0
    return quality + price + location                           # 0..15


def recommend(restaurants, preferences):
    # pick the restaurant with the highest utility
    best_restaurant = None
    best_utility = -1
    for restaurant in restaurants:
        u = utility_function(restaurant, preferences)
        if u > best_utility:
            best_utility = u
            best_restaurant = restaurant
    return best_restaurant, best_utility


# list of available restaurants: food quality (1-5), price (1-5), location
restaurants = [
    {"name": "Shandiz", "quality": 5, "price": 4, "location": "north"},
    {"name": "Divan",   "quality": 4, "price": 3, "location": "north"},
    {"name": "Moslem",  "quality": 4, "price": 2, "location": "central"},
    {"name": "Sizil",   "quality": 3, "price": 2, "location": "east"},
    {"name": "Bahar",   "quality": 5, "price": 2, "location": "north"},
]

print("Available restaurants (quality / price / location):")
for r in restaurants:
    print(f"  {r['name']}: {r['quality']} / {r['price']} / {r['location']}")

# the preferences stated by the user (like input() in the reference file)
preferences = {
    "location": input("\nEnter preferred location (north/central/east): "),
    "price": int(input("Enter preferred price (1=cheap, 5=expensive): ")),
    "min_quality": int(input("Enter minimum food quality (1-5): ")),
}

print("\nUtilities:")
for r in restaurants:
    print(f"  {r['name']}: {utility_function(r, preferences)}")

best, best_utility = recommend(restaurants, preferences)
if best is None:
    print("\nNo acceptable restaurant found")
else:
    print(f"\nRecommended restaurant: {best['name']} (utility = {best_utility})")
