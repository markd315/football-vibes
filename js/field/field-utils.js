// Field utility functions
// Helper functions for field coordinates and locations

/**
 * Gets location coordinates from field location data
 * @param {string} locationName - Name of the location
 * @param {Array} fieldLocations - Field location data
 * @returns {Object|null} Location coordinates {x, y} or null
 */
function getLocationCoords(locationName, fieldLocations) {
    if (!fieldLocations || !locationName) return null;
    
    for (const section of fieldLocations) {
        for (const loc of section.Locations) {
            if (loc.Name === locationName) {
                return { x: loc.X, y: loc.Y };
            }
        }
    }
    return null;
}

