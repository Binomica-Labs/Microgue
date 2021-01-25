local Concord = require("concord")

-- Defining components
Concord.component("position", function(c, x, y)
    c.x = x or 0
    c.y = y or 0
end)

Concord.component("velocity", function(c, x, y)
    c.x = x or 0
    c.y = y or 0
end)

local Drawable = Concord.component("drawable")


-- Defining Systems
local MoveSystem = Concord.system({
    pool = {"position", "velocity"}
})

function MoveSystem:update(dt)
    for _, e in ipairs(self.pool) do
        e.position.x = e.position.x + e.velocity.x * dt
        e.position.y = e.position.y + e.velocity.y * dt
    end
end


local DrawSystem = Concord.system({
    pool = {"position", "drawable"}
})

function DrawSystem:draw()
    for _, e in ipairs(self.pool) do
        love.graphics.circle("fill", e.position.x, e.position.y, 5)
    end
end


-- Create the World
local world = Concord.world()

-- Add the Systems
world:addSystems(MoveSystem, DrawSystem)

-- This Entity will be rendered on the screen, and move to the right at 100 pixels a second
local entity_1 = Concord.entity(world)
:give("position", 100, 100)
:give("velocity", 100, 0)
:give("drawable")

-- This Entity will be rendered on the screen, and stay at 50, 50
local entity_2 = Concord.entity(world)
:give("position", 50, 50)
:give("drawable")

-- This Entity does exist in the World, but since it doesn't match any System's filters it won't do anything
local entity_3 = Concord.entity(world)
:give("position", 200, 200)


-- Emit the events
function love.update(dt)
    world:emit("update", dt)
end

function love.draw()
    world:emit("draw")
end