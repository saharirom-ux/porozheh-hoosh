# Model-based reflex agent for temperature control (2 rooms)
# (Russell & Norvig, AIMA chapter 2, section 2.5 - agents with internal state)

class TemperatureAgent:
    def __init__(self):
        self.room = 0                       # percept
        self.environment = [17, 24]         # initial temperature of room 0 and room 1
        self.target = 20                    # desired temperature
        self.model = {}                     # internal model (memory of observed rooms)

    def perceive(self):
        return self.environment[self.room]

    def update_model(self, perception):
        self.model[self.room] = perception

    def predict_future_state(self):
        # what the model believes about the current room
        return self.model.get(self.room, 'unknown')

    def decide_action(self):
        perception = self.perceive()
        self.update_model(perception)
        if perception < self.target:
            return 'heat'                   # room is too cold
        if perception > self.target:
            return 'cool'                   # room is too hot
        # room is already 20: consult the model before moving
        if self.predict_future_state() != self.target:
            return 'heat'
        return 'move'

    def act(self, action):
        if action == 'heat':
            self.environment[self.room] += 1
            self.model[self.room] = self.environment[self.room]  # keep the model in sync
        elif action == 'cool':
            self.environment[self.room] -= 1
            self.model[self.room] = self.environment[self.room]
        elif action == 'move':
            self.room = (self.room + 1) % 2   # visit the other room

    def goal_reached(self):
        # the goal is checked from the model (memory), not by seeing both rooms at once
        return len(self.model) == 2 and all(t == self.target for t in self.model.values())


agent = TemperatureAgent()
print("Initial environment:", agent.environment)

while not agent.goal_reached():
    action = agent.decide_action()
    agent.act(action)
    print(f"Room: {agent.room}, Action: {action}, "
          f"Environment: {agent.environment}, Model: {agent.model}")

print("Final environment:", agent.environment)
