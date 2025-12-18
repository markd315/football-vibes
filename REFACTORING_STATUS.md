# Refactoring Status

## Completed Modules

### ✅ Assignments Module (`js/assignments/`)
- `assignments-data.js` - Assignment categories and actions (offensive & defensive)
- `playcalls-data.js` - Offensive and defensive playcall definitions
- `assignments-ui.js` - Basic UI rendering structure (partial)

### ✅ Personnel Module (`js/personnel/`)
- `personnel-detection.js` - detectOffensivePersonnel, detectDefensivePersonnel
- `personnel-rules.js` - categorizeOffense, categorizeDefense, calcWeightedEval, tierAvg, calcAvgPercentile

### ✅ Team Selection Module (`js/team-selection/`)
- `team-loader.js` - loadAvailableTeams, loadSelectedRosters, loadJsonConfig
- `team-ui.js` - populateTeamSelectors, updateTeamPreview, checkStartGameButton

### ✅ Special Teams Module (`js/special-teams/`)
- `special-teams.js` - executePunt, executeFieldGoal, showSpecialTeamsResult

### ✅ Game State Module (`js/game-state/`)
- `game-state-loader.js` - loadGameState, loadBaselineRates, loadTiming, loadFatigue
- `game-state-updater.js` - updateRostersForPossession, changePossession, saveGameState

### ✅ Traits Module (`js/traits/`)
- `trait-detector.js` - Already exists (detectPlayerTrait)
- `trait-calculator.js` - calculateEffectivePercentile (extracted)

## Still in app.js (Needs Extraction)

### Assignments
- ✅ `createAssignmentItem` - Extracted to `js/assignments/assignments-item.js`
- ✅ `updateAssignment` - Extracted to `js/assignments/assignments-item.js`
- ✅ `updateManCoverageSelector` - Extracted to `js/assignments/assignments-item.js`
- ✅ `populateActions` - Extracted to `js/assignments/assignments-item.js`
- ✅ `getGapFromTechnique` - Extracted to `js/assignments/assignments-helpers.js`
- ✅ `getDefaultGapFromLocation` - Extracted to `js/assignments/assignments-helpers.js`
- ✅ `applyOffensivePlaycall` - Extracted to `js/assignments/assignments-apply.js`
- ✅ `applyDefensivePlaycall` - Extracted to `js/assignments/assignments-apply.js`
- ✅ `applyBracketPlaycall` - Extracted to `js/assignments/assignments-apply.js`
- ✅ `assignManCoverage` - Extracted to `js/assignments/assignments-helpers.js`
- `renderPlaycallDiagram` - Renders offensive playcall diagram (needs extraction)
- `renderDefensePlaycallDiagram` - Renders defensive playcall diagram (needs extraction)

### Formations
- ✅ `applyOffensiveFormation` - Extracted to `js/formations/formations-apply.js`
- ✅ `applyDefensiveFormation` - Extracted to `js/formations/formations-apply.js`
- ✅ Formation data - Extracted to `js/formations/formations-data.js`
- ✅ `resolveLocationName` - Extracted to `js/field/field-location-utils.js`
- ✅ `resolveFormationPosition` - Extracted to `js/field/field-location-utils.js`
- ✅ `getLocationCoords` - Extracted to `js/field/field-utils.js`

### Game State
- `updateGameState` - Updates game state after play result
- `updateGameStateDisplay` - Updates game state UI display
- `calculateClockRunoff` - Calculates clock runoff
- `applyClockRunoff` - Applies clock runoff
- `recoverAllPlayersStamina` - Recovers stamina between plays

### Other
- Field rendering functions
- Player selection/placement functions
- Step navigation
- LLM calling functions
- State machine execution
- Fatigue updates

## Integration Notes

### Current Dependencies
All extracted modules use function parameters to avoid global dependencies. However, app.js still has:
- Global state variables (gameState, rosters, etc.)
- DOM manipulation functions
- Functions that need access to multiple modules

### Next Steps
1. Extract remaining assignment functions to `js/assignments/assignments-apply.js`
2. Extract formation code to `js/formations/`
3. Extract remaining game state functions
4. Update `index.html` to load all new modules
5. Update `app.js` to import/use all modules
6. Update `js/csv-generator.js` to properly access `calculateEffectivePercentile`
7. Test integration

### Module Loading Strategy
Since we're using script tags (not ES6 modules), functions need to be:
- Defined globally, OR
- Attached to window object, OR
- Passed as parameters

Current approach: Functions are defined globally and can be called from app.js after script tags load.

