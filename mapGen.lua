local mapGen = {}
local map = {}
local mapSize = 256


function mapGen:generate()
    for y=1, mapSize do
    map[y] = {}
        for x=1, mapSize do
            map[y][x] = 1       --fill with 1 to initialize map
        end
    end
    return map
end


function mapGen:loadMapFromImage(imageFromDirectory)

local mapImageData = love.image.newImageData(imageFromDirectory)
local mapImage = love.graphics.newImage(mapImageData)
	for x=0,mapImage:getWidth()-1 do	-- yes, a 0 :/
		map[x] = {}
		for y=0,mapImage:getHeight()-1 do
            currentPixel,_,_,_ = mapImageData:getPixel(x,y)
            if currentPixel == 0 then
			map[x][y] = 1
            elseif currentPixel == 1 then
                map[x][y] = 0
             else
                map[x][y] = "?"
            end
		end
	end
end


function mapGen:writeMap()
    local f = love.filesystem.newFile("testLevel.lua")
    
    f:open("w")
    f:write("local map = \r\n")
    f:write("{\r\n")
    for i=0, mapSize-1 do
        for j=0, mapSize-1 do
            if j == 0 then
                f:write("{" .. map[i][j]..",") 
            elseif j < mapSize-1 then
                f:write(map[i][j]..",")
            else
                if i < mapSize-1 then
                    f:write(map[i][j].."},\r\n")
                else
                    f:write(map[i][j].."}\r\n")
                end 
            end   
        end
    end
    f:write("}\r\n")
    f:write("return map\r\n")
    f:close()
end

return mapGen