# Football Vibes - NFL RPG Play Designer

An interactive NFL play design and simulation game where you (and an optional split-screen 1v1 opponent) act as an offensive or defensive coordinator, designing plays and evaluating schematic matchups using AI-powered analysis.

## MVP Features

### 5-Step Play Design Workflow

1. **Step 0: Decision** - Choose to run a normal play, punt, or field goal
2. **Step 1: Personnel Selection** - Select 11 offensive and 11 defensive players from game-day rosters
   - Default: 11 personnel (1 QB, 1 RB, 1 TE, 3 WR, 5 OL) for offense
   - Default: Nickel defense (2 DE, 2 DT, 2 LB, 3 CB, 2 S) for defense
3. **Step 2: Formation Building** - Drag and drop players to positions on the field
   - Pre-populated offensive line (T/G/C/G/T)
   - Pre-loaded offensive and defensive formations available via dropdown
   - Visual field with player markers showing name, position, rating, and stamina
4. **Step 3: Motions and Shifts** - (Skipped in MVP)
5. **Step 4: Assignments** - Assign blocking/coverage responsibilities to all players
   - Offensive: Routes, blocks, runs, QB actions
   - Defensive: Coverage zones, man coverage, blitzes, rushes
   - Playcall dropdowns to quickly set default assignments for entire team
   - Visual playcall diagrams showing routes and coverage
6. **Step 5: Coaching Points** - Add one coaching point per side (max 50 characters)

### Game Features

- **AI-Powered Analysis**: LLM evaluates play schematic matchups using spatial+scheme analysis (70% weight), positional matchups (20%), and personnel (10%)
- **State Machine Evaluation**: Determines play outcomes (havoc/explosive/success/unsuccessful) using statistical methods
- **Fatigue System**: Logarithmic fatigue calculation affecting player effectiveness
- **Game State Management**: Tracks down, distance, yardline, score, time, timeouts, and possession
- **Clock Management**: Automatic time runoff based on play type and score differential
- **Special Teams**: Punt and field goal execution with simplified outcomes
- **Possession System**: Tracks which team has the ball and uses appropriate rosters

## Running the Application

This is a **frontend-only application** that must be run through a local web server due to CORS restrictions when loading JSON files.

### Quick Start

1. **Navigate to the project directory** in your terminal
2. **Start the Python HTTP server**:
   ```bash
   python -m http.server 8000
   ```
3. **Open your browser** and navigate to:
   ```
   http://localhost:8000
   ```
4. The application will load and you can start designing plays!

### Alternative Server Options

If you don't have Python installed, you can use:

- **Node.js**: `npx serve` or `npx http-server`
- **VS Code**: Install "Live Server" extension, right-click `index.html`, select "Open with Live Server"
- **Any other static file server** that serves files on `localhost`

**Note**: Opening `index.html` directly in a browser will cause CORS errors when loading JSON files. Always use a web server.

## File Structure

```
football-vibes-2/
├── index.html              # Main HTML interface
├── app.js                  # Application logic (5500+ lines)
├── config.js               # API keys (gitignored, load from .env)
├── gamestate.json          # Current game state
├── play-state-machine.json # State machine configuration
├── fieldlocations.json     # Field position coordinates (X/Y)
├── rosters/
│   ├── home-offense.json   # Home team offensive roster (24 players)
│   ├── home-defense.json   # Home team defensive roster (24 players)
│   ├── away-offense.json   # Away team offensive roster (24 players)
│   ├── away-defense.json   # Away team defensive roster (24 players)
│   └── allstar/            # Original all-star rosters
├── outcomes/               # Statistical outcome definitions
│   ├── successful-run.json
│   ├── successful-pass.json
│   ├── unsuccessful-run.json
│   ├── unsuccessful-pass.json
│   ├── explosive-run.json
│   ├── havoc-sack.json
│   ├── havoc-fumble.json
│   ├── havoc-interception.json
│   ├── havoc-tackle-for-loss.json
│   ├── yac-catch.json
│   ├── punt.json
│   ├── field-goal-success.json
│   └── field-goal-miss.json
└── context/
    └── eval-format.json    # LLM output format specification
```

## Usage

1. **Start the server**: `python -m http.server 8000`
2. **Open browser**: Navigate to `http://localhost:8000`
3. **Design a play**:
   - Step 0: Choose play type (normal/punt/field goal)
   - Step 1: Select 11 offensive and 11 defensive players
   - Step 2: Drag players to positions on the field (or use formation dropdowns)
   - Step 3: (Skipped)
   - Step 4: Assign blocking/coverage responsibilities (or use playcall dropdowns)
   - Step 5: Add coaching points (optional)
4. **Execute the play** to see:
   - LLM analysis and rationale
   - Play outcome type (havoc/explosive/success/unsuccessful/incomplete)
   - Yards gained
   - Updated game state (down, distance, yardline, score, time)

## State Machine Flow

1. **LLM Analysis** → Returns success-rate, havoc-rate, explosive-rate, offense-advantage, risk-leverage
2. **Roll 1-100** → Determines outcome type (havoc/explosive/success/unsuccessful)
3. **For passes**: Roll for completion percentage first
4. **Roll 1-100** → Determines specific outcome (e.g., sack, interception, TFL for havoc)
5. **Roll 1-100** → Calculates yards using statistical methods from outcome file
6. **Check turnover** → Based on outcome file's turnover-probability
7. **Update game state** → Down, distance, yardline, score, time, fatigue

Each outcome file contains statistical properties (average-yards-gained, standard-deviation, skewness, kurtosis) used to calculate yards from the 1-100 roll.

## LLM Integration

Prompt caching notes: https://platform.claude.com/docs/en/build-with-claude/prompt-caching#pricing

The application uses Claude (or OpenAI GPT-5) for play analysis. 

**⚠️ IMPORTANT SECURITY NOTE**: The current implementation uses `config.js` to store API keys, which is served directly to browser users. This is **NOT SECURE** for production. For production deployments, you must implement a separate backend server endpoint to handle API key management and LLM API calls. The frontend should make requests to your backend, which then securely calls the LLM API.

For local development:
1. Create a `.env` file in the project root with:
   ```
   OPENAI_API_KEY=your_api_key_here
   ```
2. Manually copy the API key to `config.js` (this file is gitignored)
3. The application will load the API key from `config.js`

The LLM analyzes:
- **Spatial relationships** (X/Y coordinates, blocking schemes, coverage vs routes)
- **Positional matchups** (player ratings, stamina-adjusted effectiveness)
- **Personnel quality** (overall team strength)

Returns numeric rates (0-100) for success, havoc, explosive, plus offense-advantage (-10 to 10) and risk-leverage (0-10)

## Fatigue System

Player fatigue is calculated logarithmically:
- **85% stamina** = 99% effectiveness
- **60% stamina** = 80% effectiveness
- Drops off logarithmically below 60%

Fatigue is applied to player percentile ratings, affecting play outcomes. Stamina changes:
- **+3-5%** for players not on the field
- **-1-2%** for players on the field (based on roll)

## Game Rules

- **Downs and Distance**: Follows standard NFL rules (4 downs, 10 yards for first down)
- **Clock Management**: 
  - Winning team: 44s runoff (run), 28s (pass)
  - Losing team: 36s runoff (run), 19s (pass)
  - Timeouts: 3 per team, reduce runoff to 6 seconds
- **Possession**: Team with the ball uses their offense roster; opponent uses their defense roster
- **Special Teams**: Punt (40-65 yards) and field goal (95% base - 1.81% per yardline)

## Troubleshooting

### CORS Errors
**Solution**: Always use a web server. Never open `index.html` directly. Use `python -m http.server 8000` and navigate to `http://localhost:8000`.

### Files Not Loading
Ensure all JSON files are in the correct directories and you're accessing from `http://localhost:8000` (not `file://`).

### API Key Not Working
1. Check that `.env` file exists with `OPENAI_API_KEY=...`
2. Manually copy the API key from `.env` to `config.js`
3. Ensure `config.js` is loaded before `app.js` in `index.html`
4. Check browser console (F12) for API errors

**Note**: In production, use a backend server endpoint for API keys instead of `config.js` to prevent exposing secrets to browser users.

### Players Not Showing
- Check browser console for errors
- Verify roster JSON files are valid JSON
- Ensure you've selected 11 players for both offense and defense

## Development Notes

- **Frontend-only**: Vanilla JavaScript (no frameworks)
- **Data Loading**: All JSON loaded via `fetch()` API
- **State Management**: Game state and rosters updated in memory (not persisted to files)
- **API Keys**: Currently stored in `config.js` (gitignored) for local development only
- **Production Requirements**: 
  - **Secrets Management**: `config.js` is served directly to browsers, exposing API keys. For production, implement a separate backend server endpoint that handles API key management and makes LLM API calls on behalf of the frontend.
  - **State Persistence**: Would need backend for persistent game state storage

## Current Rosters

- **Home Team**: 2025 Los Angeles Rams (offense and defense)
- **Away Team**: 2025 Jacksonville Jaguars (offense and defense)
- All rosters include realistic percentile ratings (15th-92nd percentile range)
- 24 players per roster (game-day active roster size)
