# Simple reflex agent for the 4-location (2x2) vacuum world (Russell & Norvig)
# Rule cycle: A --right--> B --down--> D --left--> C --up--> A

class VacuumAgent:
    def __init__(self):
        self.location = 'A'  # percept
        self.environment = {'A': 'on', 'B': 'on', 'C': 'off', 'D': 'on'}

    def interpret_input(self):
        return (self.location, self.environment[self.location])  # state

    def rule_action(self, state):
        location, status = state
        if status == 'on':
            print("Turning off", location)
            self.environment[location] = 'off'
        elif location == 'A':
            print("Moving right to B")
            self.location = 'B'
        elif location == 'B':
            print("Moving down to D")
            self.location = 'D'
        elif location == 'D':
            print("Moving left to C")
            self.location = 'C'
        else:  # location == 'C'
            print("Moving up to A")
            self.location = 'A'


agent = VacuumAgent()
print("Initial environment:", agent.environment)
for _ in range(5):
    state = agent.interpret_input()
    agent.rule_action(state)
print("Final environment:", agent.environment)
