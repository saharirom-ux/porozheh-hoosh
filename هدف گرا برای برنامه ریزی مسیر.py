from collections import deque

# Goal-based agent for path planning (Russell & Norvig, AIMA chapter 2)
# A goal-based agent first plans a route to the goal, then follows the plan.

class PathPlanningAgent:
    def __init__(self, start, goal, maze):
        self.position = start
        self.goal = goal
        self.maze = maze
        self.path = []          # cells visited so far
        self.plan = []          # moves planned by search: Right/Down/Left/Up
        self.plan_route()       # planning phase (search before acting)

    def perceive(self):
        return self.position

    def plan_route(self):
        # Breadth-First Search: shortest route in an unweighted maze
        queue = deque([self.position])
        parent = {self.position: None}
        move_of = {}
        while queue:
            cell = queue.popleft()
            if cell == self.goal:
                break
            x, y = cell
            for action, (dx, dy) in [("Right", (0, 1)), ("Down", (1, 0)),
                                     ("Left", (0, -1)), ("Up", (-1, 0))]:
                nx, ny = x + dx, y + dy
                inside = 0 <= nx < len(self.maze) and 0 <= ny < len(self.maze[0])
                if inside and self.maze[nx][ny] == 0 and (nx, ny) not in parent:
                    parent[(nx, ny)] = cell
                    move_of[(nx, ny)] = action
                    queue.append((nx, ny))
        # rebuild the plan (list of moves) from goal back to start
        moves = []
        cell = self.goal
        while parent.get(cell) is not None:
            moves.append(move_of[cell])
            cell = parent[cell]
        moves.reverse()
        self.plan = moves

    def act(self):
        if self.position == self.goal:
            return "GoalReached"
        if not self.plan:
            return "NoPath"
        return self.plan.pop(0)        # next move of the plan

    def update_position(self, action):
        x, y = self.position
        if action == "Right":
            self.position = (x, y + 1)
        elif action == "Down":
            self.position = (x + 1, y)
        elif action == "Left":
            self.position = (x, y - 1)
        elif action == "Up":
            self.position = (x - 1, y)
        self.path.append(self.position)


# Maze setup (0 = path, 1 = wall)
maze = [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1],
    [1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1],
    [1, 1, 1, 0, 1]
]

agent = PathPlanningAgent(start=(1, 1), goal=(3, 3), maze=maze)

while agent.position != agent.goal:
    percept = agent.perceive()
    action = agent.act()
    print(f"Position: {percept}, Action: {action}")
    if action == "NoPath":
        print("Goal is unreachable")
        break
    agent.update_position(action)

print("Path to goal:", agent.path)
