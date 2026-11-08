class VacuumAgent:
    def __init__(self):
        self.location = 0  # percept
        self.environment = ['on', 'on', 'off', 'on']  # 2x2 grid: [on, on / off, on]

    def interpret_input(self):
        return self.environment[self.location]  # state

    def rule_action(self, state):
        if state == 'on':
            print("Turning off cell", self.location)
            self.environment[self.location] = 'off'
        else:
            print("Moving to the next cell")
            self.location = (self.location + 1) % len(self.environment)


agent = VacuumAgent()
print("Initial environment:", agent.environment)
for _ in range(6):
    state = agent.interpret_input()
    agent.rule_action(state)
print("Final environment:", agent.environment)
