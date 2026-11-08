class TemperatureAgent:
    def __init__(self):
        self.location = 0  # percept (the agent starts in room 0)
        self.environment = [17, 24]  # initial temperature of room 0 and room 1
        self.T_MIN = 20  # comfort range: 20 - 22 degrees
        self.T_MAX = 22

    def interpret_input(self):
        return self.environment[self.location]  # state

    def rule_action(self, state):
        if state < self.T_MIN:
            print("Heating room", self.location)
            self.environment[self.location] += 1
        elif state > self.T_MAX:
            print("Cooling room", self.location)
            self.environment[self.location] -= 1
        else:
            print("Moving to the next room")
            self.location = (self.location + 1) % len(self.environment)


agent = TemperatureAgent()
print("Initial environment:", agent.environment)
for _ in range(7):
    state = agent.interpret_input()
    agent.rule_action(state)
print("Final environment:", agent.environment)
