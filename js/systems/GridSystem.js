export const TILE = {
    GRASS: 0,
    PATH: 1,
    BREAKABLE: 2,
    BARRICADE: 3,
};

export const TILE_SIZE = 32;
export const GRID_COLS = 20;
export const GRID_ROWS = 15;
export const GAME_WIDTH = GRID_COLS * TILE_SIZE;
export const GAME_HEIGHT = GRID_ROWS * TILE_SIZE;

// Base waypoints for carving the initial path
export const WAYPOINTS = [
    { col: -1, row: 2 },
    { col: 14, row: 2 },
    { col: 14, row: 6 },
    { col: 3, row: 6 },
    { col: 3, row: 10 },
    { col: 16, row: 10 },
    { col: 16, row: 13 },
    { col: 20, row: 13 },
];

export class GridSystem {
    constructor() {
        this.grid = this._buildGrid();
    }

    _buildGrid() {
        const grid = Array.from({ length: GRID_ROWS }, () =>
            Array.from({ length: GRID_COLS }, () => TILE.GRASS)
        );

        // Carve main path
        for (let i = 0; i < WAYPOINTS.length - 1; i++) {
            const from = WAYPOINTS[i];
            const to = WAYPOINTS[i + 1];

            if (from.row === to.row) {
                const minC = Math.max(0, Math.min(from.col, to.col));
                const maxC = Math.min(GRID_COLS - 1, Math.max(from.col, to.col));
                for (let c = minC; c <= maxC; c++) grid[from.row][c] = TILE.PATH;
            } else {
                const minR = Math.min(from.row, to.row);
                const maxR = Math.max(from.row, to.row);
                const col = Math.max(0, Math.min(GRID_COLS - 1, from.col));
                for (let r = minR; r <= maxR; r++) grid[r][col] = TILE.PATH;
            }
        }

        // Add breakable block detours (which are longer)
        // Detour 1: around the first vertical drop (col 14, row 2 to 6)
        // Detour goes through cols 16-17
        this._fillBlocks(grid, 15, 2, 17, 3, TILE.BREAKABLE);
        this._fillBlocks(grid, 16, 4, 17, 7, TILE.BREAKABLE);
        this._fillBlocks(grid, 15, 6, 15, 7, TILE.BREAKABLE);

        // Detour 2: around the second vertical drop (col 3, row 6 to 10)
        // Detour goes left through cols 0-1
        this._fillBlocks(grid, 1, 6, 2, 7, TILE.BREAKABLE);
        this._fillBlocks(grid, 1, 8, 2, 11, TILE.BREAKABLE);

        return grid;
    }

    _fillBlocks(grid, c1, r1, c2, r2, type) {
        for (let r = r1; r <= r2; r++) {
            for (let c = c1; c <= c2; c++) {
                if (r >= 0 && r < GRID_ROWS && c >= 0 && c < GRID_COLS) {
                    grid[r][c] = type;
                }
            }
        }
    }

    canBuildTower(col, row) {
        if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return false;
        return this.grid[row][col] === TILE.GRASS;
    }

    canBuildBarricade(col, row) {
        if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return false;
        // Barricades can only be placed on PATH
        return this.grid[row][col] === TILE.PATH;
    }

    worldToGrid(x, y) {
        return {
            col: Math.floor(x / TILE_SIZE),
            row: Math.floor(y / TILE_SIZE),
        };
    }

    gridToWorld(col, row) {
        return {
            x: col * TILE_SIZE + TILE_SIZE / 2,
            y: row * TILE_SIZE + TILE_SIZE / 2,
        };
    }

    /** Cells an enemy is allowed to stand on. Mirrors findPath's filter. */
    isWalkable(col, row) {
        if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return false;
        const tile = this.grid[row][col];
        return tile !== TILE.GRASS && tile !== TILE.BARRICADE;
    }

    /**
     * Closest walkable cell, searched outward. Enemies spawned by a dying
     * parent land on a scatter offset that can fall on the grass beside a
     * bend; pathing from there cuts the corner, or finds nothing at all.
     */
    nearestWalkable(col, row) {
        if (this.isWalkable(col, row)) return { col, row };

        const seen = new Set([`${col},${row}`]);
        const queue = [{ col, row }];

        while (queue.length > 0) {
            const cur = queue.shift();
            for (const adj of this.getAdjacentCells(cur.col, cur.row)) {
                const key = `${adj.col},${adj.row}`;
                if (seen.has(key)) continue;
                seen.add(key);
                if (this.isWalkable(adj.col, adj.row)) return adj;
                queue.push(adj);
            }
        }
        return { col, row };
    }

    getAdjacentCells(col, row) {
        return [
            { col, row: row - 1 },
            { col, row: row + 1 },
            { col: col - 1, row },
            { col: col + 1, row },
        ].filter(c =>
            c.col >= 0 && c.col < GRID_COLS &&
            c.row >= 0 && c.row < GRID_ROWS
        );
    }

    /**
     * BFS to find the shortest path.
     * Weights: PATH=1, BREAKABLE=5 (so it prefers PATH unless blocked).
     */
    findPath(startCol, startRow, endCol, endRow) {
        // We use a simple Dijkstra for weighted grid (cost 1 vs 5)
        const dist = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(Infinity));
        const prev = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null));

        const queue = [];
        
        // Push start node
        if (startCol >= 0 && startCol < GRID_COLS) {
            dist[startRow][startCol] = 0;
            queue.push({ col: startCol, row: startRow, cost: 0 });
        } else if (startCol < 0) {
            // Special case for entrance (offscreen left)
            dist[startRow][0] = 0;
            queue.push({ col: 0, row: startRow, cost: 0 });
        }

        while (queue.length > 0) {
            queue.sort((a, b) => a.cost - b.cost);
            const curr = queue.shift();

            if (curr.col === endCol && curr.row === endRow) break;
            if (curr.col === GRID_COLS - 1 && endCol >= GRID_COLS) break; // exit reached

            for (const adj of this.getAdjacentCells(curr.col, curr.row)) {
                const tile = this.grid[adj.row][adj.col];
                if (tile === TILE.GRASS || tile === TILE.BARRICADE) continue; // Unwalkable

                const edgeCost = tile === TILE.BREAKABLE ? 5 : 1;
                const newCost = curr.cost + edgeCost;

                if (newCost < dist[adj.row][adj.col]) {
                    dist[adj.row][adj.col] = newCost;
                    prev[adj.row][adj.col] = curr;
                    queue.push({ col: adj.col, row: adj.row, cost: newCost });
                }
            }
        }

        // Reconstruct path
        const path = [];
        let curr = null;

        if (endCol >= GRID_COLS) {
            // Find which cell on the right edge was reached
            let minC = Infinity;
            for (let r = 0; r < GRID_ROWS; r++) {
                if (dist[r][GRID_COLS - 1] < minC) {
                    minC = dist[r][GRID_COLS - 1];
                    curr = { col: GRID_COLS - 1, row: r };
                }
            }
            if (minC === Infinity) return null; // No path to exit
        } else {
            if (dist[endRow][endCol] === Infinity) return null;
            curr = { col: endCol, row: endRow };
        }

        while (curr) {
            path.push(curr);
            curr = prev[curr.row][curr.col];
        }

        return path.reverse();
    }
}
