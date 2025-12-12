# Football Vibes - Play Designer

An interactive football play design and simulation game where you act as an offensive or defensive coordinator, designing plays and evaluating schematic matchups.

## Features

- **5-Step Play Design Workflow**:
  1. Personnel Selection (11 offensive + 11 defensive players)
  2. Formation Building (drag & drop players on field)
  3. Motions and Shifts (MVP: skipped)
  4. Player Assignments (blocking/coverage responsibilities)
  5. Coaching Points (one player per play)

- **State Machine Evaluation**: Determines play outcomes based on LLM analysis using 1-100 rolls
- **Fatigue System**: Logarithmic fatigue calculation affecting player performance
- **Game State Management**: Tracks down, distance, yardline, score, and time

## Running the Application

This is a **frontend-only application**. Simply open `index.html` in your web browser.

### Option 1: Direct File Open
1. Navigate to the project folder
2. Double-click `index.html`
3. The application will open in your default browser

### Option 2: VS Code Live Server
If you're using VS Code:
1. Install the "Live Server" extension
2. Right-click on `index.html`
3. Select "Open with Live Server"

### Option 3: Any Web Server
If you encounter CORS issues with JSON files, use any simple web server:
- Python: `python -m http.server 8000` then open `http://localhost:8000`
- Node.js: `npx serve` or `npx http-server`
- Or any other static file server

## File Structure

```
football-vibes-2/
├── index.html              # Main HTML interface
├── app.js                  # Application logic (browser-side)
├── gamestate.json          # Current game state
├── play-state-machine.json # State machine configuration
├── fieldlocations.json     # Field position coordinates
├── blocking-assignments.json # Available blocking assignments
├── rosters/
│   ├── offense.json        # Offensive roster (20 players)
│   └── defense.json        # Defensive roster (20 players)
├── outcomes/
│   ├── successful-run.json
│   ├── explosive-run.json
│   ├── havoc-run.json
│   ├── havoc-sack.json
│   ├── havoc-turnover.json
│   ├── havoc-tackle-for-loss.json
│   ├── yac-catch.json
│   ├── unsuccessful-run.json
│   ├── successful-pass.json
│   ├── explosive-pass.json
│   └── incomplete-pass.json
└── context/
    ├── context-gameloop    # Game loop context
    ├── eval-format.json    # LLM output format
    └── prompt-pass-schematic-success # LLM prompt template
```

## Usage

1. **Open `index.html` in your browser**
2. **Design a play**:
   - Step 1: Select 11 offensive and 11 defensive players
   - Step 2: Drag players to positions on the field
   - Step 3: Motions (skipped in MVP)
   - Step 4: Assign blocking/coverage responsibilities
   - Step 5: Add a coaching point for one player
3. **Execute the play** to see:
   - LLM analysis output (logged to browser console - press F12)
   - Play outcome and yards gained
   - Updated game state

## State Machine Flow

1. **LLM Analysis** → Returns success-rate, havoc-rate, explosive-rate
2. **Roll 1-100** → Determines outcome type (havoc/explosive/success/unsuccessful)
3. **Roll 1-100** → Determines specific outcome (e.g., sack, turnover, TFL for havoc)
4. **Roll 1-100** → Calculates yards using statistical methods from outcome file
5. **Check turnover** → Based on outcome file's turnover-probability

Each outcome file contains statistical properties (average-yards-gained, standard-deviation, skewness) used to calculate yards from the 1-100 roll.

## LLM Integration

The application currently uses a **mock LLM** that generates realistic output. To integrate a real LLM:

1. Update the `callLLM()` function in `app.js`
2. Add your API key (from `.env` file)
3. Build the prompt using the template from `context/prompt-pass-schematic-success`
4. Ensure the LLM response ends with `eval-format.json` format

The intended LLM output is logged to the browser console (F12 → Console tab) for reference.

## Fatigue System

Player fatigue is calculated logarithmically:
- **85% stamina** = 99% effectiveness
- **60% stamina** = 80% effectiveness
- Drops off logarithmically below 60%

Fatigue is applied to player percentile ratings, affecting play outcomes.

## Troubleshooting

### CORS Errors
If you see CORS errors when loading JSON files, use a web server instead of opening the file directly. See "Running the Application" above.

### Files Not Loading
Ensure all JSON files are in the correct directories and you're opening from the project root.

## Development Notes

- The application uses vanilla JavaScript (no frameworks)
- All data is loaded via `fetch()` API calls
- Game state and rosters are updated in memory (not persisted to files in browser)
- For production, you'll need a backend to persist game state and handle LLM API calls
