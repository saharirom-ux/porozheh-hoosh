# Goal-based agent for the Travelling Salesman Problem (Russell & Norvig)
# AIMA chapter 2 (goal-based agents) & chapter 3 (problem solving / search)
# The agent plans the whole tour first (exhaustive search), then follows it.

from itertools import permutations


class TSPAgent:
    def __init__(self, start, cities, distances):
        self.start = start                 # starting city
        self.cities = cities               # all cities to visit
        self.distances = distances         # distances[a][b] = cost of a -> b
        self.position = start              # percept: current city
        self.tour = [start]                # cities visited so far
        self.cost = 0                      # total distance walked
        self.plan = []                     # planned tour (list of cities)
        self.plan_tour()                   # planning phase (search before acting)

    def perceive(self):
        return self.position

    def plan_tour(self):
        # search every possible order of the other cities,
        # keep the one with the smallest total distance
        best_cost = None
        others = [c for c in self.cities if c != self.start]
        for order in permutations(others):
            route = [self.start] + list(order) + [self.start]
            total = 0
            for i in range(len(route) - 1):
                total += self.distances[route[i]][route[i + 1]]
            if best_cost is None or total < best_cost:
                best_cost = total
                # next cities to visit, then return to the start city
                self.plan = list(order) + [self.start]

    def act(self):
        if self.goal_reached():
            return "GoalReached"
        if not self.plan:
            return "NoPath"
        return self.plan.pop(0)             # next city of the plan

    def update_tour(self, action):
        self.cost += self.distances[self.position][action]
        self.position = action
        self.tour.append(action)

    def goal_reached(self):
        # all cities visited and back at the start?
        return (not self.plan
                and len(self.tour) == len(self.cities) + 1
                and self.position == self.start)


# Problem setup: 5 cities and the distance matrix (symmetric)
cities = ["A", "B", "C", "D", "E"]
distances = {
    "A": {"A": 0, "B": 10, "C": 15, "D": 20, "E": 25},
    "B": {"A": 10, "B": 0, "C": 35, "D": 25, "E": 30},
    "C": {"A": 15, "B": 35, "C": 0, "D": 30, "E": 20},
    "D": {"A": 20, "B": 25, "C": 30, "D": 0, "E": 15},
    "E": {"A": 25, "B": 30, "C": 20, "D": 15, "E": 0},
}

agent = TSPAgent(start="A", cities=cities, distances=distances)
planned = [agent.start] + agent.plan
planned_cost = sum(distances[a][b] for a, b in zip(planned, planned[1:]))
print("Planned tour:", planned, "| planned cost:", planned_cost)

while not agent.goal_reached():
    percept = agent.perceive()
    action = agent.act()
    if action == "NoPath":
        print("Tour is impossible")
        break
    print(f"Position: {percept}, Action: go to {action}")
    agent.update_tour(action)

print("Final tour:", agent.tour)
print("Total distance:", agent.cost)
