class VacuumAgent:
    def __init__(self):
        self.row = 0  # percept
        self.col = 0
        self.environment = [['on', 'on'],   # row 0: cell (0,0), cell (0,1)
                            ['off', 'on']]  # row 1: cell (1,0), cell (1,1)

    def interpret_input(self):
        return self.environment[self.row][self.col]  # state

    def rule_action(self, state):
        if state == 'on':
            print("Turning off cell", (self.row, self.col))
            self.environment[self.row][self.col] = 'off'
        else:
            print("Moving to the next cell")
            if self.col == 0:          # left -> right, then top -> bottom
                self.col = 1
            else:
                self.col = 0
                self.row = (self.row + 1) % 2


agent = VacuumAgent()
print("Initial environment:", agent.environment)
for _ in range(6):
    state = agent.interpret_input()
    agent.rule_action(state)
print("Final environment:", agent.environment)
