local gamera = require 'gamera'
local map = require 'map'
local Grid = require 'jumper.grid'
local Pathfinder = require 'jumper.pathfinder'

local walkable = 0

local cameraBounds = {}
cameraBounds.T = 0
cameraBounds.L = 0
cameraBounds.W = 0
cameraBounds.H = 0


-- Creates a grid object
local grid = Grid(map)

-- Creates a pathfinder object using Jump Point Search algorithm
local myFinder = Pathfinder(grid, 'JPS', walkable)

-- Define start and goal locations coordinates



------------------

local min, max = math.min, math.max

-- game variables (entities)
local world, player, cam1, cam2, cursor

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
        love.graphics.setColor(1,1,1)
				love.graphics.rectangle("line", x * 32, y * 32, 32, 32)
			end
		end
	end
  end
  


  local function updateCameras()
    cam1:setPosition(player.act_x+16, player.act_y+16)
    cam2:setPosition(player.act_x+16, player.act_y+16)
  
    local scaleFactor = 0
    --cam1:setScale(cam1:getScale() + scaleFactor * dt)
  
    local angleFactor = 0
    --cam1:setAngle(cam1:getAngle() + angleFactor * dt)
  end



  local function drawCursor()
    love.graphics.setColor(1,0,0)
    love.graphics.rectangle("line", cursor.x, cursor.y, 32, 32)
  end



  local function drawCam1ViewPort()
    love.graphics.setColor(1,1,1)
    love.graphics.rectangle('line', cam1:getVisible())
  end

 
  
  local function drawPlayer()
    love.graphics.setColor(1,1,1)
    love.graphics.rectangle("fill", player.act_x, player.act_y, 32, 32)
	end



  local function updatePlayer(dt)
    player.act_y = player.act_y - ((player.act_y - player.grid_y) * player.speed * dt)
    player.act_x = player.act_x - ((player.act_x - player.grid_x) * player.speed * dt)
  end



  local function updateCursor(dt)
    mouseX, mouseY = love.mouse.getPosition()
    mouseGridX = math.floor(mouseX/32) * 32 
	  mouseGridY = math.floor(mouseY/32) * 32
    cursor.x, cursor.y = cam1:toWorld(mouseGridX, mouseGridY)
  end



function love.load()

    love.window.setFullscreen(true, "desktop")
    world  = { w = 3200, h = 3200, rows = 10, columns = 20 }
    cursor = { x = 256,  y = 256 }
    player = 
    {
		grid_x = 512,
		grid_y = 512,
		act_x = 512,
		act_y = 512,
		speed = 10
    }

  cam1 = gamera.new(32, 32, world.w, world.h)
  cam1:setWindow(0,0,800,800)

  cam2 = gamera.new(32,32, world.w, world.h)
  cam2:setWindow(864,0,256,256)
  cam2:setScale(0)

end
 


function love.update(dt)
    updatePlayer(dt)
    updateCameras(dt)
    updateCursor(dt)
    
    cameraBounds.T,cameraBounds.L,cameraBounds.W, cameraBounds.H = cam1:getWindow() 
    if cursor.x < player.grid_x - cameraBounds.W/2 then
      cursor.x = player.grid_x - cameraBounds.W/2
    end
    if cursor.x > player.grid_x + cameraBounds.W/2 - 16 then
      cursor.x = player.grid_x + cameraBounds.W/2 - 16
    end
    if cursor.y < player.grid_y - cameraBounds.H/2  then
      cursor.y = player.grid_y - cameraBounds.H/2 
    end
    if cursor.y > player.grid_y + cameraBounds.H/2 - 16 then
      cursor.y = player.grid_y + cameraBounds.H/2 - 16
    end
    
     startx, starty = math.floor((player.grid_x/32)+0.5), math.floor((player.grid_y/32)+0.5)
     endx, endy = math.floor((cursor.x/32)+0.5), math.floor((cursor.y/32)+0.5)

    -- Calculates the path, and its length
     path, length = myFinder:getPath(startx, starty, endx, endy)

end
 


function love.draw()
 
    love.graphics.setColor(1,1,1)
    --local path, length = myFinder:getPath(6, 6, 12, 12)

    cam1:draw(function(l,t,w,h)
        drawWorld(l,t,w,h)
        drawPlayer()
        drawCursor()
      end)
    
      cam2:draw(function(l,t,w,h)
        drawWorld(l,t,w,h)
        drawPlayer()
        drawCursor()
        drawCam1ViewPort()
      end)

      love.graphics.setColor(1,1,1)
      love.graphics.rectangle('line', cam1:getWindow())
      love.graphics.rectangle('line', cam2:getWindow())

      --local path, length = myFinder:getPath(startx, starty, endx, endy)
    if path then
        msgPath = "Path found!"
        msgPathLength = tostring(length)
    else
        msgPath = "NO PATH"
        msgPathLength = "NO LENGTH"
    end
    
    love.graphics.print("Path Detected?: " .. msgPath, 32, 832)
    love.graphics.print("Path Length: " .. msgPathLength, 32, 842)
    love.graphics.print("Player Actual X: " .. player.act_x, 32, 852)
    love.graphics.print("Player Actual Y: " .. player.act_y, 32, 862)
    love.graphics.print("Player Grid X: " .. player.grid_x, 32, 872)
    love.graphics.print("Player Grid Y: " .. player.grid_y, 32, 882)
    love.graphics.print("Mouse X: " .. mouseX, 32, 892)
    love.graphics.print("Mouse Y: " .. mouseY, 32, 902)
    love.graphics.print("Cursor X: " .. cursor.x/32, 32, 912)
    love.graphics.print("Cursor Y: " .. cursor.y/32, 32, 922)
    love.graphics.print("Path Start x: " .. startx, 32, 932)
    love.graphics.print("Path Start y: " .. starty, 32, 942)
    love.graphics.print("Path End x: " .. endx, 32, 952)
    love.graphics.print("Path End y: " .. endy, 32, 962)
    
    
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