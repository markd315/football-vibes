// Field location utility functions
// Resolves location names and formation positions from field location data

/**
 * Resolves a location name to coordinates, preferring offensive or defensive side
 * @param {string} locationName - Name of the location
 * @param {boolean} preferDefensive - If true, prefer defensive positions (Y > 0), else offensive (Y < 0)
 * @param {string} preferredSection - Optional preferred section name
 * @param {Array} fieldLocations - Field location data
 * @returns {Object|null} Location object with name, x, y, section
 */
function resolveLocationName(locationName, preferDefensive = false, preferredSection = null, fieldLocations) {
    if (!fieldLocations || !locationName) return null;
    
    // First, do a global sweep to find ALL matching location names
    const allMatches = [];
    for (const section of fieldLocations) {
        for (const loc of section.Locations) {
            if (loc.Name === locationName) {
                allMatches.push({
                    name: loc.Name,
                    x: loc.X,
                    y: loc.Y,
                    section: section.Section
                });
            }
        }
    }
    
    if (allMatches.length === 0) return null;
    if (allMatches.length === 1) return allMatches[0];
    
    // Multiple matches found - filter by criteria
    let filtered = allMatches;
    
    // Filter by section if specified
    if (preferredSection) {
        const sectionFiltered = filtered.filter(m => 
            m.section.toLowerCase().includes(preferredSection.toLowerCase())
        );
        if (sectionFiltered.length > 0) {
            filtered = sectionFiltered;
        }
    }
    
    // Filter by side of Y=0 line (defensive = Y > 0, offensive = Y < 0)
    if (preferDefensive) {
        const defensiveMatches = filtered.filter(m => m.y > 0);
        if (defensiveMatches.length > 0) {
            filtered = defensiveMatches;
        }
    } else {
        const offensiveMatches = filtered.filter(m => m.y < 0);
        if (offensiveMatches.length > 0) {
            filtered = offensiveMatches;
        }
    }
    
    // If still multiple matches, prefer positions closer to Y=0 (line of scrimmage)
    if (filtered.length > 1) {
        filtered.sort((a, b) => Math.abs(a.y) - Math.abs(b.y));
    }
    
    return filtered[0];
}

/**
 * Resolves a formation position (handles both old format with x/y and new format with just name)
 * @param {string|Object} pos - Position string or object
 * @param {boolean} preferDefensive - If true, prefer defensive positions
 * @param {string} preferredSection - Optional preferred section name
 * @param {Array} fieldLocations - Field location data
 * @param {Function} resolveLocationName - Function to resolve location name
 * @returns {Object|null} Resolved position object
 */
function resolveFormationPosition(pos, preferDefensive = false, preferredSection = null, fieldLocations, resolveLocationName) {
    // If it's already a resolved position with x, y, return as-is
    if (pos.x !== undefined && pos.y !== undefined) {
        return pos;
    }
    // If it's just a string (location name), resolve it
    if (typeof pos === 'string') {
        return resolveLocationName(pos, preferDefensive, preferredSection, fieldLocations);
    }
    // If it's an object with just a name, resolve it
    if (pos.name && pos.x === undefined) {
        const resolved = resolveLocationName(pos.name, preferDefensive, preferredSection, fieldLocations);
        return resolved ? { ...resolved, ...pos } : pos;
    }
    return pos;
}

