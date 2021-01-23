local gamera = require 'gamera'
local map = require 'map'
local Grid = require 'jumper.grid'
local Pathfinder = require 'jumper.pathfinder'

local walkable = 0

--------------------------------
-- Library setup
-- Calls the grid class
local Grid = require ("jumper.grid")
-- Calls the pathfinder class
local Pathfinder = require ("jumper.pathfinder")

-- Creates a grid object
local grid = Grid(map)

-- Creates a pathfinder object using Jump Point Search algorithm
local myFinder = Pathfinder(grid, 'JPS', walkable)

-- Define start and goal locations coordinates
local startx, starty = 1,1
local endx, endy = 12, 12

-- Calculates the path, and its length
local path = myFinder:getPath(startx, starty, endx, endy)



------------------

local min, max = math.min, math.max

-- game variables (entities)
local world, player, cam1, cam2

-- auxiliary functions
local floor = math.floor

local function makeZero(x,minX,maxX)
  if x > maxX or x < minX then return x end
  return 0
end



local function drawWorld(cl,ct,cw,ch)
    local w = world.w / world.columns
    local h = world.h / world.rows
  
    local minX = max(floor(cl/w), 0)
    local maxX = min(floor((cl+cw)/w), world.columns-1)
    local minY = max(floor(ct/h), 0)
    local maxY = min(floor((ct+ch)/h), world.rows-1)
  
    for y=1, #map do
		for x=1, #map[y] do
			if map[y][x] == 1 then
				love.graphics.rectangle("line", x * 32, y * 32, 32, 32)
			end
		end
	end
  end
  


  local function updateCameras(dt)
    cam1:setPosition(player.act_x, player.act_y)
    cam2:setPosition(player.act_x, player.act_y)
  
    local scaleFactor = 0
    cam1:setScale(cam1:getScale() + scaleFactor * dt)
  
    local angleFactor = 0
    cam1:setAngle(cam1:getAngle() + angleFactor * dt)
  end



  local function drawCam1ViewPort()
    love.graphics.setColor(255,255,255,100)
    love.graphics.rectangle('line', cam1:getVisible())
  end

 
  
  local function drawPlayer()
    love.graphics.setColor(255,255,255,100)
    love.graphics.rectangle("fill", player.act_x, player.act_y, 32, 32)
	for y=1, #map do
		for x=1, #map[y] do
			if map[y][x] == 1 then
				love.graphics.rectangle("line", x * 32, y * 32, 32, 32)
			end
		end
    end
  end



  local function updatePlayer(dt)
    player.act_y = player.act_y - ((player.act_y - player.grid_y) * player.speed * dt)
    player.act_x = player.act_x - ((player.act_x - player.grid_x) * player.speed * dt)
  end



function love.load()

    love.window.setFullscreen(true, "desktop")
    world  = { w = 3200, h = 3200, rows = 10, columns = 20 }

    player = 
    {
		grid_x = 256,
		grid_y = 256,
		act_x = 256,
		act_y = 256,
		speed = 10
    }

    

  cam1 = gamera.new(0, 0, world.w, world.h)
  cam1:setWindow(32,32,800,800)

  cam2 = gamera.new(0,0, world.w, world.h)
  cam2:setWindow(832,32,256,256)
  cam2:setScale(0)

end
 


function love.update(dt)
    updatePlayer(dt)
    updateCameras(dt)
end
 


function love.draw()
 
    love.graphics.setColor(255,255,255,100)
    local path, length = myFinder:getPath(startx, starty, endx, endy)
if path then
  print(('Path found! Length: %.2f'):format(length))
    for node, count in path:iter() do
      print(('Step: %d - x: %d - y: %d'):format(count, node.x, node.y))
    end
end

    cam1:draw(function(l,t,w,h)
        drawWorld(l,t,w,h)
        drawPlayer()
      end)
    
      cam2:draw(function(l,t,w,h)
        drawWorld(l,t,w,h)
        drawPlayer()
        drawCam1ViewPort()
      end)

      love.graphics.setColor(255,255,255)
      love.graphics.rectangle('line', cam1:getWindow())
      love.graphics.rectangle('line', cam2:getWindow())

end
 


function love.keypressed(key)
	if key == "up" then
		if testMap(0, -1) then
            player.grid_y = player.grid_y - 32
		end
	elseif key == "down" then
		if testMap(0, 1) then
            player.grid_y = player.grid_y + 32
		end
	elseif key == "left" then
		if testMap(-1, 0) then
            player.grid_x = player.grid_x - 32
		end
	elseif key == "right" then
		if testMap(1, 0) then
            player.grid_x = player.grid_x + 32
		end
    elseif key == 'escape' then love.event.quit()
    end
end



function testMap(x, y)
	if map[(player.grid_y / 32) + y][(player.grid_x / 32) + x] == 1 then
		return false
	end
	return true
end 