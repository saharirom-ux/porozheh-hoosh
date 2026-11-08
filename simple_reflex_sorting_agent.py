class SortingAgent:
    def __init__(self):
        self.location = 0  # percept
        self.direction = 1  # 1 = right, -1 = left
        self.environment = [42, 15, 78, 5, 33, 60, 21, 88, 12, 50]  # 10 masses

    def interpret_input(self):
        # percept: (current mass, next mass in the direction of movement)
        nxt = self.location + self.direction
        if 0 <= nxt < len(self.environment):
            return self.environment[self.location], self.environment[nxt]
        return self.environment[self.location], None  # end of the line

    def rule_action(self, state):
        cur, nxt = state
        if nxt is None:
            print("Reached the end of the line, turning back")
            self.direction = -self.direction
        elif (self.direction == 1 and cur > nxt) or (self.direction == -1 and cur < nxt):
            j = self.location + self.direction
            print("Swapping", cur, "and", nxt)
            self.environment[self.location], self.environment[j] = \
                self.environment[j], self.environment[self.location]
        else:
            print("Moving to the next cell")
            self.location += self.direction

    def is_sorted(self):
        return all(self.environment[i] <= self.environment[i + 1]
                   for i in range(len(self.environment) - 1))


agent = SortingAgent()
print("Initial environment:", agent.environment)
steps = 0
while not agent.is_sorted() and steps < 5000:
    steps += 1
    state = agent.interpret_input()
    agent.rule_action(state)
print("Final environment:", agent.environment)
