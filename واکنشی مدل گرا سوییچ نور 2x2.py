# Model-based reflex agent for the light switch problem (2x2 grid)
# (Russell & Norvig, AIMA chapter 2, section 2.5 - agents with internal state)

class LightSwitchAgent:
    def __init__(self):
        self.row = 0                      # percept
        self.col = 0
        self.environment = [['on', 'on'],    # 2 rows x 2 columns
                            ['on', 'off']]
        self.model = {}                   # internal model (memory of observed cells)

    def perceive(self):
        return self.environment[self.row][self.col]

    def update_model(self, perception):
        self.model[(self.row, self.col)] = perception

    def predict_future_state(self):
        # what the model believes about the current cell
        return self.model.get((self.row, self.col), 'unknown')

    def decide_action(self):
        perception = self.perceive()
        self.update_model(perception)
        if perception == 'on':
            return 'turn_off'
        # cell is off: consult the model before moving
        if self.predict_future_state() == 'on':
            return 'turn_off'             # model disagrees -> act again
        return 'move'

    def act(self, action):
        if action == 'turn_off':
            self.environment[self.row][self.col] = 'off'
            self.model[(self.row, self.col)] = 'off'   # keep the model in sync
        elif action == 'move':
            if self.col == 0:             # left -> right, then top -> bottom
                self.col = 1
            else:
                self.col = 0
                self.row = (self.row + 1) % 2

    def goal_reached(self):
        # the goal is checked from the model (memory), not by seeing all cells
        return len(self.model) == 4 and all(s == 'off' for s in self.model.values())


agent = LightSwitchAgent()
print("Initial environment:", agent.environment)

while not agent.goal_reached():
    action = agent.decide_action()
    agent.act(action)
    print(f"Position: ({agent.row}, {agent.col}), Action: {action}, "
          f"Environment: {agent.environment}, Model: {agent.model}")

print("Final environment:", agent.environment)
