/**
 *
 * @param renderingData {RenderingData} rendering data
 * @param lookupTable {LookupTable} lookup table
 * @param configs {Object} application configurations
 * @return {Object} Handlebars environment
 */
function registerHelpers(renderingData, lookupTable, configs) {
    var log = new Log("[rendering-handlebars-helpers]");
    var constants = require("constants.js").constants;
    var handlebarsEnvironment = require(constants.LIBRARY_HANDLEBARS).Handlebars;

    /**
     * Holds runtime data.
     * @type {{currentPageFullName: string, currentUnitFullName: string, processingZones: string[],
     *     processingDefZones: string[]}}
     */
    var runtimeData = {
        currentPageFullName: null,
        currentUnitFullName: null,
        processingZones: [],
        processingDefZones: []
    };

    /**
     * Returns the boolean value of the specified object.
     * @param obj {Object} object to be converted to boolean
     * @param {boolean} [defaultValue=false] if <code>obj</code> is <code>null</code> or
     *     <code>undefined</code> then this values is returned
     * @return {boolean} boolean value of the parsed object
     */
    function parseBoolean(obj, defaultValue) {
        defaultValue = defaultValue || false;
        switch (typeof obj) {
            case 'boolean':
                return obj;
            case 'number':
                return (obj > 0);
            case 'string':
                var objLowerCased = obj.toLowerCase();
                return ((objLowerCased == "true") || (objLowerCased == "yes"));
            default:
                return (obj) ? true : defaultValue;
        }
    }

    /**
     * Returns script file path and 'super' script object of the specified UI component.
     * @param uiComponent {UIComponent} UI component to be processed
     * @param uiComponentType {string} type of the UI component, either "unit" or "page"
     * @param lookupTable {LookupTable} lookup table
     * @return {{scriptFilePath: string, super: Object}} script file path and 'super' script object
     */
    function getUiComponentScriptData(uiComponent, uiComponentType, lookupTable) {
        var parentComponentsFullNames = uiComponent.parents;
        var numberOfParentComponents = parentComponentsFullNames.length;
        var scriptFunctionName = constants.UI_COMPONENT_JS_FUNCTION_ON_REQUEST;
        var components = (uiComponentType == "unit") ? lookupTable.units : lookupTable.pages;

        // If this UI component has a script file with 'onRequest' function, then get it.
        var componentScriptFilePath = uiComponent.scriptFilePath;
        var scriptFilePath = null;
        if (componentScriptFilePath) {
            var componentScript = require(componentScriptFilePath);
            if (componentScript.hasOwnProperty(scriptFunctionName)) {
                scriptFilePath = componentScriptFilePath;
            }
        }

        // Otherwise, get the script with 'onRequest' function from the nearest parent.
        // Meanwhile construct the 'super' object.
        var superScript = {};
        var currentSuperScript = superScript;
        for (var i = 0; i < numberOfParentComponents; i++) {
            var parentScriptFilePath = components[parentComponentsFullNames[i]].scriptFilePath;
            if (parentScriptFilePath) {
                var parentScript = require(parentScriptFilePath);
                if (parentScript.hasOwnProperty(scriptFunctionName)) {
                    if (!scriptFilePath) {
                        scriptFilePath = parentScriptFilePath;
                    }
                    currentSuperScript[scriptFunctionName] = parentScript[scriptFunctionName];
                } else {
                    currentSuperScript[scriptFunctionName] = null;
                }
            } else {
                currentSuperScript[scriptFunctionName] = null;
            }
            currentSuperScript.super = {};
            currentSuperScript = currentSuperScript.super;
        }

        return {scriptFilePath: scriptFilePath, super: superScript};
    }

    /**
     * Returns the processing unit of the specified unit.
     * @param parentUnit {UIComponent} unit mentioned in the template
     * @param lookupTable {LookupTable} lookup table
     * @return {UIComponent} processing unit
     */
    function getFurthestChildUnit(parentUnit, lookupTable) {
        if (parentUnit.children.length == 0) {
            // This unit has no children.
            return parentUnit;
        }

        /** @type {UIComponent} */
        var furthestChild = null;
        var furthestChildDistance = -1;
        var parentUnitFullName = parentUnit.fullName;
        var units = lookupTable.units;
        var childrenUnitsFullNames = parentUnit.children;
        var numberOfChildrenUnits = childrenUnitsFullNames.length;
        for (var i = 0; i < numberOfChildrenUnits; i++) {
            var childUnit = units[childrenUnitsFullNames[i]];
            var distance = childUnit.parents.indexOf(parentUnitFullName);
            if (furthestChildDistance < distance) {
                furthestChildDistance = distance;
                furthestChild = childUnit;
            } else if (furthestChildDistance == distance) {
                log.warn("Child unit '" + furthestChild.fullName + "' and '" + childUnit.fullName
                         + "' are in the same distance (" + distance + ") from their parent unit '"
                         + parentUnitFullName + "'. Hence child unit '" + childUnit.fullName
                         + "' was ignored when calculating the furthest child unit.");
            }
        }
        return furthestChild;
    }


    function compareUiComponents(componentAFullName, componentBFullName) {
        var units = lookupTable.units;
        var pages = lookupTable.pages;
        var tmp, uiComponentA, uiComponentB;
        var isUiComponentAUnit, isUiComponentBUnit;

        /** @type {UIComponent} */
        tmp = units[componentAFullName];
        if (tmp) {
            // UI Component A is an unit
            uiComponentA = tmp;
            isUiComponentAUnit = true;
        } else {
            // UI Component A is a page
            uiComponentA = pages[componentAFullName];
            isUiComponentAUnit = false;
        }
        tmp = units[componentBFullName];
        if (tmp) {
            // UI Component B is an unit
            uiComponentB = tmp;
            isUiComponentBUnit = true;
        } else {
            // UI Component B is a page
            uiComponentB = pages[componentBFullName];
            isUiComponentBUnit = false;
        }

        if (isUiComponentAUnit && isUiComponentBUnit) {
            return (uiComponentA.index > uiComponentB.index) ? 1 : -1;
        } else {
            // Page come after units.
            return (isUiComponentAUnit) ? -1 : 1;
        }
    }

    /**
     * Read and returns the content of the template file of the specified UI component.
     * @param uiComponent {UIComponent} UI component
     * @param uiComponentType {string} type of the UI component, either "unit" or "page"
     * @return {string} content of the template file
     */
    function readTemplateFile(uiComponent, uiComponentType) {
        try {
            var file = new File(uiComponent.templateFilePath);
            file.open("r");
            var content = file.readAll();
            file.close();
            return content;
        } catch (e) {
            var msg = "Cannot read template '" + uiComponent.templateFilePath + +"' of "
                      + uiComponentType + " '" + uiComponent.fullName + "'.";
            log.error(msg);
            log.error(e);
            throw new Error(msg);
        }
    }

    handlebarsEnvironment.registerHelper("page", function (pageFullName, options) {
        var pages = lookupTable.pages;
        var page = pages[pageFullName];

        runtimeData.currentPageFullName = pageFullName;
        var prevProcessingZones = runtimeData.processingZones;
        runtimeData.processingZones = [];
        var prevProcessingDefZones = runtimeData.processingDefZones;
        runtimeData.processingDefZones = [];

        var pageScriptData = getUiComponentScriptData(page, "page", lookupTable);
        var templateContext = null;
        if (pageScriptData.scriptFilePath) {
            var scriptContext = {
                app: {
                    name: renderingData.context.appData.name,
                    uri: renderingData.context.appData.uri
                },
                uriParams: renderingData.context.uriData.params,
                handlebars: handlebarsEnvironment,
                super: pageScriptData.super
            };
            var pageScript = require(pageScriptData.scriptFilePath);
            templateContext =
                pageScript[constants.UI_COMPONENT_JS_FUNCTION_ON_REQUEST](scriptContext);
        }
        // Set additional properties to the template context.
        templateContext = (templateContext) ? templateContext : {};
        var templateOptions = {
            data: {
                app: {
                    name: renderingData.context.appData.name,
                    uri: renderingData.context.appData.uri
                },
                uriParams: renderingData.context.uriData.params
            }
        };

        // If has inner HTMl, then process it.
        if (options.fn) {
            // {{#page "pageName"}} {{#zone "PUSHED-UNITS"}} ... {{/zone}} {{/page}}
            options.fn(templateContext, templateOptions);
        }
        // Get this page's template.
        var templateFilePath = page.templateFilePath;
        if (!templateFilePath) {
            // If not, get the nearest parent's template.
            var parentPagesFullNames = page.parents;
            var numberOfParentPages = parentPagesFullNames.length;
            for (var i = 0; i < numberOfParentPages; i++) {
                templateFilePath = (pages[parentPagesFullNames[i]]).templateFilePath;
                if (templateFilePath) {
                    break;
                }
            }
        }
        if (templateFilePath) {
            var pageContent = readTemplateFile(page, "page");
            var pageTemplate = handlebarsEnvironment.compile(pageContent);
            pageTemplate(templateContext, templateOptions);
        }

        runtimeData.currentPageFullName = null;
        runtimeData.processingZones = prevProcessingZones;
        runtimeData.processingDefZones = prevProcessingDefZones;

        return "";
    });

    handlebarsEnvironment.registerHelper("unit", function (mentionedUnitFullName, options) {
        // Runtime data updating.
        runtimeData.currentUnitFullName = null;
        var prevProcessingZones = runtimeData.processingZones;
        runtimeData.processingZones = [];
        var prevProcessingDefZones = runtimeData.processingDefZones;
        runtimeData.processingDefZones = [];

        var units = lookupTable.units;
        var mentionedUnit = units[mentionedUnitFullName];
        if (!mentionedUnit) {
            var msg = "Unit '" + mentionedUnitFullName + +"' does not exists.";
            log.error(msg);
            throw new Error(msg);
        }

        var processingUnit = getFurthestChildUnit(mentionedUnit, lookupTable);
        runtimeData.currentUnitFullName = processingUnit.fullName;
        if (log.isDebugEnabled()) {
            if (mentionedUnit.fullName != processingUnit.fullName) {
                log.debug("Unit '" + processingUnit.fullName + "' is processed for unit '"
                          + mentionedUnit.fullName + "'.");
            }
        }

        var unitScriptData = getUiComponentScriptData(processingUnit, "unit", lookupTable);
        var templateContext = null;
        if (unitScriptData.scriptFilePath) {
            var scriptContext = {
                app: {
                    name: renderingData.context.appData.name,
                    uri: renderingData.context.appData.uri
                },
                unit: {
                    cssClass: "unit-" + processingUnit.fullName,
                    params: options.hash,
                    publicUri: renderingData.context.appData.uri
                               + constants.DIRECTORY_APP_UNIT_PUBLIC
                               + "/" + processingUnit.fullName
                },
                uriParams: renderingData.context.uriData.params,
                super: unitScriptData.super
            };
            var unitScript = require(unitScriptData.scriptFilePath);
            templateContext =
                unitScript[constants.UI_COMPONENT_JS_FUNCTION_ON_REQUEST](scriptContext);
        }
        // Set additional properties to the template context.
        templateContext = (templateContext) ? templateContext : {};
        var templateOptions = {
            data: {
                app: {
                    name: renderingData.context.appData.name,
                    uri: renderingData.context.appData.uri
                },
                unit: {
                    cssClass: "unit-" + processingUnit.fullName,
                    params: options.hash,
                    publicUri: renderingData.context.appData.uri
                               + constants.DIRECTORY_APP_UNIT_PUBLIC + "/" + processingUnit.fullName
                },
                uriParams: renderingData.context.uriData.params
            }
        };

        var buffer = [];
        // Process this unit's template.
        if (processingUnit.templateFilePath) {
            var unitContent = readTemplateFile(processingUnit, "unit");
            var unitTemplate = handlebarsEnvironment.compile(unitContent);
            buffer.push(unitTemplate(templateContext, templateOptions));
        }
        // Process parents' templates from nearest to furthest.
        var parentUnitsFullNames = processingUnit.parents;
        var numberOfParentUnits = parentUnitsFullNames.length;
        for (var i = 0; i < numberOfParentUnits; i++) {
            var parentUnit = units[parentUnitsFullNames[i]];
            if (parentUnit.templateFilePath) {
                var parentUnitContent = readTemplateFile(parentUnit, "unit");
                var parentTemplate = handlebarsEnvironment.compile(parentUnitContent);
                buffer.push(parentTemplate(templateContext, templateOptions));
            }
        }

        // Runtime data updating.
        runtimeData.currentUnitFullName = null;
        runtimeData.processingZones = prevProcessingZones;
        runtimeData.processingDefZones = prevProcessingDefZones;

        renderingData.renderedUnits.push(processingUnit.fullName);
        return new handlebarsEnvironment.SafeString(buffer.reverse().join(""));
    });

    handlebarsEnvironment.registerHelper("zone", function (zoneName, options) {

        var mainZoneName, subZoneName;
        var zonesStack = runtimeData.processingZones;
        switch (zonesStack.length) {
            case 0:
                // This is a top level main-zone.
                mainZoneName = zoneName;
                subZoneName = null;
                break;
            case 1:
                // This is a sub-zone.
                // {{#zone "mainZoneName"}} ... {{#zone "subZoneName"}} ... {{/zone}} ... {{/zone}}
                mainZoneName = zonesStack[0];
                subZoneName = zoneName;
                break;
            default:
                // Zone inside a zone inside a zone ...
                throw new Error("Too many sub-zones in zone'" + zonesStack[0] + "'.");
        }

        var uiComponentFullName = null;
        if (runtimeData.currentPageFullName) {
            // inside a page
            if (runtimeData.currentUnitFullName) {
                // inside an unit
                uiComponentFullName = runtimeData.currentUnitFullName;
            } else {
                // inside a page, but outside any unit
                uiComponentFullName = runtimeData.currentPageFullName;
            }
        } else {
            // inside the layout
            return "";
        }

        zonesStack.push(zoneName);
        var isOverride = parseBoolean(options.hash["override"], true); // default is true

        /**
         * @type {Object.<string, {mainZoneData: {isOverridden: boolean, buffer: string[]},
         *     subZonesData: Object.<string, {isOverridden: boolean, buffer: string[]}>}>}
         */
        var zoneData = renderingData.zones[mainZoneName];
        if (zoneData) {

            var uiComponentData = zoneData[uiComponentFullName];
            if (uiComponentData) {
                // This is a parent of the processing unit and child unit has/children units have
                // put some HTML to this zone.
                if (subZoneName) {
                    // Now we are processing a sub-zone.
                    var subZoneData = null;
                    if (uiComponentData.subZonesData) {
                        subZoneData = uiComponentData.subZonesData[subZoneName];
                    } else {
                        // Adding a sub-zone
                        uiComponentData.subZonesData = {};
                    }
                    if (subZoneData) {
                        if (subZoneData.isOverridden) {
                            // Previously processed child unit overrides the processing parent unit
                            // for this sub-zone. So do nothing.
                        } else {
                            // Previously processed child unit has requested to append its HTML to
                            // the processing parent unit's HTML for this sub-zone.
                            subZoneData.buffer.push(options.fn(this));
                        }
                    } else {
                        // This sub-zone is not initialized yet.
                        subZoneData = {
                            isOverridden: isOverride,
                            buffer: null
                        };
                        uiComponentData.subZonesData[subZoneName] = subZoneData;
                        subZoneData.buffer = [options.fn(this)];
                    }
                } else {
                    // Now we are processing a top level main-zone.
                    var mainZoneData = uiComponentData.mainZoneData;
                    if (mainZoneData) {
                        if (mainZoneData.isOverridden) {
                            // Previously processed child unit overrides the processing parent unit
                            // for this main-zone. So do nothing.
                        } else {
                            // Previously processed child unit has requested to append its HTML to
                            // the processing parent unit's HTML for this main-zone.
                            mainZoneData.buffer.push(options.fn(this));
                        }
                    } else {
                        // This main-zone is not initialized yet.
                        mainZoneData = {
                            isOverridden: isOverride,
                            buffer: null
                        };
                        uiComponentData.mainZoneData = mainZoneData;
                        mainZoneData.buffer = [options.fn(this)];
                    }
                }
            } else {
                // This is the processing child unit & it is putting some HTML to this zone.
                uiComponentData = {
                    mainZoneData: {
                        isOverridden: isOverride,
                        buffer: null
                    },
                    subZonesData: null
                };
                zoneData[uiComponentFullName] = uiComponentData;
                uiComponentData.mainZoneData.buffer = [options.fn(this)];
            }
        } else {
            // This zone is not initialized yet.
            var uiComponentData = {
                mainZoneData: {
                    isOverridden: isOverride,
                    buffer: null
                },
                subZonesData: null
            };
            zoneData = {};
            zoneData[uiComponentFullName] = uiComponentData;
            renderingData.zones[mainZoneName] = zoneData;
            uiComponentData.mainZoneData.buffer = [options.fn(this)];
        }

        zonesStack.pop();
        return "";
    });

    handlebarsEnvironment.registerHelper("defineZone", function (zoneName, options) {

        var mainZoneName, subZoneName;
        var zonesStack = runtimeData.processingDefZones;
        switch (zonesStack.length) {
            case 0:
                // This is a top level main-zone.
                mainZoneName = zoneName;
                subZoneName = null;
                break;
            case 1:
                // This is a sub-zone.
                // {{#defineZone "A"}} {{#defineZone "B"}} ... {{/defineZone}} {{/defineZone}}
                mainZoneName = zonesStack[0];
                subZoneName = zoneName;
                break;
            default:
                // defineZone inside a defineZone inside a defineZone ...
                throw new Error("Too many sub-zones defined in zone'" + zonesStack[0] + "'.");
        }
        zonesStack.push(zoneName);

        /**
         * @type {Object.<string, {mainZoneData: {isOverridden: boolean, buffer: string[]},
         *     subZonesData: Object.<string, {isOverridden: boolean, buffer: string[]}>}>}
         */
        var zoneData = renderingData.zones[mainZoneName];
        var zoneHtml = null;
        if (subZoneName) {
            // Now we are in a sub-zone.
            var renderingUiComponentFullName = options.data.unitName;
            var uiComponentData = zoneData[renderingUiComponentFullName];
            var subZoneData = uiComponentData.subZonesData[subZoneName];
            if (subZoneData) {
                zoneHtml = subZoneData.buffer.reverse().join("");
            } else {
                // UI Component does not have any HTML for this sub-zone.
                zoneHtml = "";
            }

        } else {
            // Now we are in a top level main-zone.
            if (zoneData) {
                var moreOptionsData = {unitName: null};
                var moreOptions = {data: moreOptionsData};
                var tmpBuffer = [];
                var uiComponentsFullNames = (Object.keys(zoneData)).sort(compareUiComponents);
                var numberOfUiComponentsFullNames = uiComponentsFullNames.length;
                for (var i = 0; i < numberOfUiComponentsFullNames; i++) {
                    var renderingUnitName = uiComponentsFullNames[i];
                    moreOptionsData.unitName = renderingUnitName;
                    if (options.fn) {
                        tmpBuffer.push(options.fn(this, moreOptions));
                    }
                    var uiComponentData = zoneData[renderingUnitName];
                    tmpBuffer.push(uiComponentData.mainZoneData.buffer.reverse().join(""));
                }

                zoneHtml = tmpBuffer.join("");
            } else {
                // Previously processed UI components have not put HTML for this main-zone.
                // If has, render default HTML {{#defineZone "mainZoneName"}} ... {{/defineZone}}.
                zoneHtml = (options.fn) ? options.fn(this) : "";
            }
        }

        zonesStack.pop();
        return new handlebarsEnvironment.SafeString(zoneHtml);
    });

    return handlebarsEnvironment;
}