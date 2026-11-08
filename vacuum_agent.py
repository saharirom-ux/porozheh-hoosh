# Simple reflex vacuum agent for the 2x2 world (Russell & Norvig)
# Rule cycle: A --right--> B --down--> D --left--> C --up--> A

class VacuumAgent:
    def __init__(self):
        self.location = 'A'  # percept
        self.environment = {'A': 'dirty', 'B': 'clean', 'C': 'clean', 'D': 'dirty'}

    def interpret_input(self):
        return (self.location, self.environment[self.location])  # state

    def rule_action(self, state):
        location, status = state
        if status == 'dirty':
            print("Cleaning cell", location)
            self.environment[location] = 'clean'
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
