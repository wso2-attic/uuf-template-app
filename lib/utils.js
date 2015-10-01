/**
 * Returns application configurations loaded from "/app/app-conf.json".
 * @return {Object} application configurations
 */
var getAppConfigurations;

/**
 * Returns the lookup table.
 * @param configs {Object} application configurations
 * @return {{layouts: Object.<string, string>, units: Object.<string, {shortName: string, path:
 *     string, definition: Object}>, pushedUnits: Object.<string, string[]>}} lookup table
 */
var getLookUpTable;

/**
 * Returns a random string.
 * @return {string} a random string
 */
var getRandomId;

(function () {
    var log = new Log("[utils]");
    var constants = (require("constants.js")).constants;

    /**
     * Returns layout data.
     * @param layoutsDir path to the layouts directory
     * @return {Object<string, string>} layout data
     */
    function getLayoutsData(layoutsDir) {
        var layoutsData = {};
        var layoutsFiles = new File(layoutsDir).listFiles();
        for (var i = 0; i < layoutsFiles.length; i++) {
            var layoutFile = layoutsFiles[i];
            if (layoutFile.isDirectory()) {
                // this is not a layout, ignore
                continue;
            }

            layoutsData[layoutFile.getName()] = {
                path: layoutFile.getPath()
            }
        }
        return layoutsData;
    }

    /**
     * Returns unit's data.
     * @param unitsDir {string} path to the units directory e.g. "/app/units"
     * @return {{
     *          units: Object<string, {name: string, path: string, definition: Object}>,
     *          pushedUnits: Object<string, string[]>,
     *          childUnits: Object.<string, string[]>}} unit data
     */
    function getUnitsData(unitsDir) {
        /**
         * @type {Object<string, {shortName: string, path: string, definition: Object}>}
         */
        var units = {};
        /**
         * @type {Object<string, string[]>}
         */
        var pushedUnits = {};
        /**
         * @type {Object<string, string[]>}
         */
        var childUnits = {};
        var unitDirs = new File(unitsDir).listFiles();
        for (var i = 0; i < unitDirs.length; i++) {
            var unitDir = unitDirs[i];
            if (!unitDir.isDirectory()) {
                // this is not an unit, ignore
                continue;
            }

            var unitFullName = unitDir.getName();
            var unitShortName = unitFullName.substr(unitFullName.lastIndexOf(".") + 1);
            if (!unitShortName) {
                // Invalid name for an unit, so skip this
                log.warn("Invalid unit name '" + unitFullName + "'");
                continue;
            }
            var unitPath = unitsDir + "/" + unitFullName;
            // Unit's definition is read form the <unit_short_name>.json file.
            // If doesn't exits it will be an empty JSON.
            var unitDefinition = {};
            var definitionFile = new File(unitPath + "/" + unitShortName + ".json");
            if (definitionFile.isExists() && !definitionFile.isDirectory()) {
                unitDefinition = require(definitionFile.getPath());
            } else {
                log.warn("Unable to find a definition file for unit '" + unitFullName + "'");
            }
            units[unitFullName] = {
                shortName: unitShortName,
                path: unitPath,
                definition: unitDefinition
            };

            var uriPatterns = unitDefinition.scope;
            if (uriPatterns && Array.isArray(uriPatterns)) {
                for (var j = 0; j < uriPatterns.length; j++) {
                    var uriPattern = uriPatterns[j];
                    if (!pushedUnits[uriPattern]) {
                        pushedUnits[uriPattern] = [];
                    }
                    pushedUnits[uriPattern].push(unitFullName);
                }
            }

            var parentUnitName = unitDefinition.extends;
            if (parentUnitName) {
                if (!childUnits[parentUnitName]) {
                    childUnits[parentUnitName] = [];
                }
                childUnits[parentUnitName].push(unitFullName);
            }
        }
        return {units: units, pushedUnits: pushedUnits, childUnits: childUnits};
    }

    getAppConfigurations = function () {
        // TODO: implement a proper caching mechanism
        var configs = require(constants.FILE_APP_CONF);
        return configs;
    };

    getLookUpTable = function (configs) {
        var unitData = getUnitsData(constants.DIRECTORY_APP_UNITS);
        // TODO: implement a proper caching mechanism
        return {
            layouts: getLayoutsData(constants.DIRECTORY_APP_LAYOUTS),
            units: unitData.units,
            pushedUnits: unitData.pushedUnits
        };
    };

    getRandomId = function () {
        var text = "";
        var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (var i = 0; i < 5; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    };
})();