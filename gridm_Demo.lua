function love.load()

	gr = love.graphics
	mo = love.mouse

	gr.setFont(gr.newFont(16))

	getW = gr.getWidth()
	getH = gr.getHeight()

	grid = 32
end

function love.draw()

	draw_grid()

	local gx, gy = getTile()

	draw_tile(gx, gy)

	print_info(gx, gy)
end

function draw_grid()

	gr.setColor(255, 255, 255)

	for x = 0, getW, grid do

		gr.line(x, 0, x, getH)
	end

	for y = 0, getH, grid do

		gr.line(0, y, getW, y)
	end
end

function draw_tile(gx, gy)

	gr.setColor(255, 255, 255)

	gr.rectangle("fill", gx * grid, gy * grid, grid, grid)
end

function getTile()

	local mx, my = mo.getPosition()

	return

	math.floor(mx/grid),
	math.floor(my/grid)
end

function print_info(gx, gy)

	gr.setColor(0, 0, 0)
	gr.print("gx = " .. gx .."\ngy = "..gy, gx * grid, gy * grid)
end
