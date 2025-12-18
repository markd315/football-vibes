# Refactoring Plan for app.js

## Overview
app.js is currently 8000+ lines and needs to be broken down into modular components organized by functionality.

## Folder Structure
```
js/
├── assignments/          # Assignment-related code and data
│   ├── assignments-data.js      ✅ Created
│   ├── playcalls-data.js        ✅ Created
│   └── assignments-ui.js        # UI rendering for assignments
├── formations/           # Formation code and data
│   ├── formations-data.js       # Formation definitions
│   └── formations-apply.js       # applyOffensiveFormation, applyDefensiveFormation
├── personnel/            # Personnel detection and rules
│   ├── personnel-detection.js    # detectOffensivePersonnel, detectDefensivePersonnel
│   └── personnel-rules.js       # categorizeOffense, categorizeDefense
├── team-selection/      # Team selection screen
│   ├── team-loader.js           # loadAvailableTeams, loadSelectedRosters
│   └── team-ui.js               # populateTeamSelectors, updateTeamPreview, startGame
├── special-teams/       # Special teams execution
│   └── special-teams.js          # executePunt, executeFieldGoal, showSpecialTeamsResult
├── game-state/          # Game state management
│   ├── game-state-loader.js      # loadGameState, saveGameState
│   └── game-state-updater.js     # updateGameState, changePossession, updateRostersForPossession
├── traits/              # Trait system (already exists as trait-detector.js)
│   └── trait-detector.js         ✅ Already exists
├── csv-generator.js     ✅ Already exists (needs update to call traits)
└── prompt-generator.js  ✅ Already exists (needs update to call CSV)
```

## Key Changes Needed

### 1. CSV Generator (js/csv-generator.js)
- Currently: Uses calculateEffectivePercentile from app.js
- Needed: Import and call detectPlayerTrait from js/trait-detector.js
- Update buildPlayersForCSV to collect trait adjustments

### 2. Prompt Generator (js/prompt-generator.js)
- Currently: Calls generatePlayerCSV
- Status: Already correct, just ensure it's using the updated CSV generator

### 3. App.js
- Remove all extracted code
- Import modules as needed
- Keep only:
  - Global state variables
  - Main initialization
  - Step rendering/routing
  - UI event handlers
  - Field rendering
  - Player selection/placement

## Extraction Checklist

### Assignments Module
- [x] assignments-data.js - Assignment categories and actions
- [x] playcalls-data.js - Offensive and defensive playcalls
- [ ] assignments-ui.js - renderAssignments, createAssignmentItem, updateAssignment
- [ ] assignments-apply.js - applyOffensivePlaycall, applyDefensivePlaycall, applyBracketPlaycall

### Formations Module
- [ ] formations-data.js - Formation definitions (if any)
- [ ] formations-apply.js - applyOffensiveFormation, applyDefensiveFormation
- [ ] formations-ui.js - Formation dropdown rendering

### Personnel Module
- [ ] personnel-detection.js - detectOffensivePersonnel, detectDefensivePersonnel
- [ ] personnel-rules.js - categorizeOffense, categorizeDefense, calcAvgPercentile, calcWeightedEval

### Team Selection Module
- [ ] team-loader.js - loadAvailableTeams, loadSelectedRosters, loadJsonConfig
- [ ] team-ui.js - populateTeamSelectors, updateTeamPreview, startGame, checkStartGameButton

### Special Teams Module
- [ ] special-teams.js - executePunt, executeFieldGoal, showSpecialTeamsResult

### Game State Module
- [ ] game-state-loader.js - loadGameState, saveGameState, loadBaselineRates, loadTiming, loadFatigue
- [ ] game-state-updater.js - updateGameState, changePossession, updateRostersForPossession, updateGameStateDisplay

### Traits Integration
- [ ] Update csv-generator.js to import and use detectPlayerTrait
- [ ] Ensure trait adjustments are collected and passed through

## Notes
- blocking-assignments.json appears unused - verify and remove if not needed
- All modules should use ES6 exports/imports or be loaded via script tags
- Global state variables should remain in app.js or a core.js file
- Functions that depend on DOM should be in UI modules
- Pure data/logic functions should be in data/logic modules

