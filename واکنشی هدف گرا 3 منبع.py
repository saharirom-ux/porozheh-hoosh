# Goal-based agent for budget allocation (Russell & Norvig, AIMA chapter 2 & 3)
# The agent searches all possible allocations first, then funds the best one.

class BudgetAllocationAgent:
    def __init__(self, budget, sources):
        self.budget = budget            # fixed total budget
        self.sources = sources          # [(name, weight), ...]
        self.allocated = {}             # name -> funded weight
        self.plan = []                  # sources chosen by search
        self.plan_allocation()          # planning phase (search before acting)

    def perceive(self):
        return self.budget - sum(self.allocated.values())  # remaining budget

    def plan_allocation(self):
        # search all 2^n combinations: maximize total weight within budget
        best_weight = -1
        n = len(self.sources)
        for mask in range(1 << n):
            total = 0
            chosen = []
            for i in range(n):
                if mask >> i & 1:
                    name, weight = self.sources[i]
                    total += weight
                    chosen.append(name)
            if total <= self.budget and total > best_weight:
                best_weight = total
                self.plan = chosen

    def act(self):
        if not self.plan:
            return "GoalReached"
        return self.plan.pop(0)         # next source to fund

    def update_allocation(self, action):
        for name, weight in self.sources:
            if name == action:
                self.allocated[name] = weight

    def is_goal_reached(self):
        return not self.plan


# Problem setup: 3 sources with weights 3, 8 and 17, fixed total budget = 25
agent = BudgetAllocationAgent(budget=25,
                              sources=[("A", 3), ("B", 8), ("C", 17)])

while not agent.is_goal_reached():
    percept = agent.perceive()
    action = agent.act()
    print(f"Remaining budget: {percept}, Action: Fund source {action}")
    agent.update_allocation(action)

print("Allocation:", agent.allocated)
print("Total weight:", sum(agent.allocated.values()),
      "| Remaining budget:", agent.perceive())
