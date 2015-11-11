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
    var dataStructures = require("data-structures.js");
    var Zone = dataStructures.Zone;
    renderingData.zonesTree = new dataStructures.ZoneTree();

    /**
     * Holds runtime data.
     * @type {{currentPage: UIComponent, processingUnits: UIComponent[], isProcessingParentUnits:
     *     boolean, processingZones: Zone[], processingDefZones: Zone[]}}
     */
    var runtimeData = {
        currentPage: null,
        processingUnits: [],
        isProcessingParentUnits: false,
        processingZones: [],
        processingDefZones: []
    };
    var handlebarsEnvironment = require(constants.LIBRARY_HANDLEBARS).Handlebars;

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
     * Compares two UI Components based on their 'index' values.
     * @param a {UIComponent} this UI Component
     * @param b {UIComponent} will be compared against this one
     * @return {number} if a > b then 1; if a < b then -1
     */
    function compareUiComponents(a, b) {
        var aIndex = a.index, bIndex = b.index;
        if (aIndex == bIndex) {
            return 0;
        }
        return (aIndex > bIndex) ? 1 : -1;
    }

    /**
     * Compares two Resources based on their 'provider's.
     * @param a {Resource} this Resource
     * @param b {Resource} will be compared against this one
     * @return {number} if a > b then 1; if a < b then -1
     */
    function compareResources(a, b) {
        return compareUiComponents(a.provider, b.provider);
    }

    /**
     * Read the file in the specified path and returns its content.
     * @param filePath {string} file path
     * @return {?string} content of the file
     */
    function readFile(filePath) {
        var file = new File(filePath);
        try {
            file.open("r");
            return file.readAll();
        } catch (e) {
            log.error(e);
            return null;
        } finally {
            try {
                file.close();
            } catch (ee) {
                log.error(ee);
            }
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
        var childrenUnitsFullNames = parentUnit.subZones;
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

    /**
     *
     * @param resources {Resource[]} resources
     * @return {string[]}
     */
    function getResourcesPaths(resources) {
        var sortedResources = resources.sort(compareResources);
        var numberOfResources = sortedResources.length;
        var singleResourcesPaths = [];
        var combiningResourcesPaths = [];
        for (var i = 0; i < numberOfResources; i++) {
            var resource = sortedResources[i];
            if (resource.combine) {
                combiningResourcesPaths.push(resource.path);
            } else {
                singleResourcesPaths.push(resource.path);
            }
        }
        if (combiningResourcesPaths.length > 0) {
            singleResourcesPaths.push(combiningResourcesPaths.join(","));
        }
        return singleResourcesPaths;
    }

    /**
     * 'page' Handlebars helper function.
     * @param pageFullName {string}
     * @param options {Object}
     * @return {string} empty string
     */
    function pageHelper(pageFullName, options) {
        var pages = lookupTable.pages;
        var page = pages[pageFullName];

        // Context values.
        var appName = renderingData.context.appData.name;
        var appUri = renderingData.context.appData.uri;
        var uriParams = renderingData.context.uriData.params;

        var pageScriptData = getUiComponentScriptData(page, "page", lookupTable);
        var templateContext = null;
        if (pageScriptData.scriptFilePath) {
            var scriptContext = {
                app: {name: appName, uri: appUri},
                uriParams: uriParams,
                handlebars: handlebarsEnvironment,
                super: pageScriptData.super
            };
            var pageScript = require(pageScriptData.scriptFilePath);
            templateContext =
                pageScript[constants.UI_COMPONENT_JS_FUNCTION_ON_REQUEST](scriptContext);
        }
        if (!templateContext) {
            // If the template context is not given by the unit's script, then set an empty object.
            templateContext = {};
        }
        // Additional parameters to the template context.
        var templateOptions = {
            data: {
                app: {name: appName, uri: appUri},
                uriParams: uriParams
            }
        };

        runtimeData.currentPage = page;
        // If has inner HTMl, then process it.
        if (options.fn) {
            // {{#page "pageName"}} {{#zone "_pushedUnits"}} ... {{/zone}} {{/page}}
            options.fn(templateContext, templateOptions);
        }
        // Get this page's template.
        var pageTemplateFilePath = page.templateFilePath;
        if (pageTemplateFilePath) {
            var pageContent = readFile(pageTemplateFilePath);
            if (!pageContent) {
                var msg = "Cannot read template '" + pageTemplateFilePath + "' of page '"
                          + page.fullName + "'.";
                log.error(msg);
                throw new Error(msg);
            }
            handlebarsEnvironment.compile(pageContent)(templateContext, templateOptions);
        }
        // Process parents' templates from nearest to furthest.
        var parentPagesFullNames = page.parents;
        var numberOfParentPages = parentPagesFullNames.length;
        for (var i = 0; i < numberOfParentPages; i++) {
            var parentPage = pages[parentPagesFullNames[i]];
            runtimeData.currentPage = parentPage;
            var parentPageTemplateFilePath = parentPage.templateFilePath;
            if (parentPageTemplateFilePath) {
                var parentPageContent = readFile(parentPageTemplateFilePath);
                if (!pageContent) {
                    var msg = "Cannot read template '" + parentPageTemplateFilePath + "' of page '"
                              + parentPage.fullName + "'.";
                    log.error(msg);
                    throw new Error(msg);
                }
                handlebarsEnvironment.compile(parentPageContent)(templateContext, templateOptions);
            }
        }
        runtimeData.currentPage = page;

        // Process layout.
        var layoutPath = lookupTable.layouts[page.definition[constants.PAGE_DEFINITION_LAYOUT]].path;
        var layoutContent = readFile(layoutPath);
        if (!layoutContent) {
            var msg = "Cannot read layout '" + layoutPath + "' of page '" + page.fullName + "'.";
            log.error(msg);
            throw new Error(msg);
        }

        var pageHtml = handlebarsEnvironment.compile(layoutContent)({});
        runtimeData.currentPage = null;
        return pageHtml;
    }

    /**
     * 'unit' Handlebars helper function.
     * @param mentionedUnitFullName {string}
     * @param options {Object}
     * @return {SafeString}
     */
    function unitHelper(mentionedUnitFullName, options) {
        // Runtime data backup.
        var processingUnitsStack = runtimeData.processingUnits;
        var prevProcessingZones = runtimeData.processingZones;
        runtimeData.processingZones = [];
        var prevProcessingDefZones = runtimeData.processingDefZones;
        runtimeData.processingDefZones = [];
        runtimeData.isProcessingParentUnits = false;

        var units = lookupTable.units;
        var mentionedUnit = units[mentionedUnitFullName];
        if (!mentionedUnit) {
            var msg = "Unit '" + mentionedUnitFullName + "' does not exists.";
            log.error(msg);
            throw new Error(msg);
        }

        var processingUnit = getFurthestChildUnit(mentionedUnit, lookupTable);
        processingUnitsStack.push(processingUnit);
        if (log.isDebugEnabled()) {
            if (mentionedUnit.fullName != processingUnit.fullName) {
                log.debug("Unit '" + processingUnit.fullName + "' is processed for unit '"
                          + mentionedUnit.fullName + "'.");
            }
        }

        // Context values.
        var appName = renderingData.context.appData.name;
        var appUri = renderingData.context.appData.uri;
        var unitCssClass = "unit-" + processingUnit.fullName;
        var optionsHash = options.hash;
        var optionsHashUnitParams = optionsHash["_unitParams"];
        var unitParams = (optionsHashUnitParams) ? optionsHashUnitParams : optionsHash;
        var unitPublicUri = renderingData.context.appData.uri + constants.DIRECTORY_APP_UNIT_PUBLIC
                            + "/" + processingUnit.fullName;
        var uriParams = renderingData.context.uriData.params;

        var unitScriptData = getUiComponentScriptData(processingUnit, "unit", lookupTable);
        var templateContext = null;
        if (unitScriptData.scriptFilePath) {
            var scriptContext = {
                app: {name: appName, uri: appUri},
                unit: {cssClass: unitCssClass, params: unitParams, publicUri: unitPublicUri},
                uriParams: uriParams,
                super: unitScriptData.super
            };
            var unitScript = require(unitScriptData.scriptFilePath);
            templateContext =
                unitScript[constants.UI_COMPONENT_JS_FUNCTION_ON_REQUEST](scriptContext);
        }
        if (!templateContext) {
            // If the template context is not given by the unit's script, then set an empty object.
            templateContext = {};
        }
        // Additional parameters to the template context.
        var templateOptions = {
            data: {
                app: {name: appName, uri: appUri},
                unit: {cssClass: unitCssClass, params: unitParams, publicUri: unitPublicUri},
                uriParams: uriParams
            }
        };

        var returningHtml = null;
        // Process this unit's template.
        var processingUnitTemplateFilePath = processingUnit.templateFilePath;
        if (processingUnitTemplateFilePath) {
            var unitContent = readFile(processingUnitTemplateFilePath);
            if (!unitContent) {
                var msg = "Cannot read template '" + processingUnitTemplateFilePath + "' of unit '"
                          + processingUnit.fullName + "'.";
                log.error(msg);
                throw new Error(msg);
            }
            var unitCompiledTemplate = handlebarsEnvironment.compile(unitContent);
            var unitHtml = unitCompiledTemplate(templateContext, templateOptions).trim();
            if (unitHtml.length > 0) {
                returningHtml = unitHtml;
            }
        }
        // Process parents' templates from nearest to furthest.
        var parentUnitsFullNames = processingUnit.parents;
        var numberOfParentUnits = parentUnitsFullNames.length;
        runtimeData.isProcessingParentUnits = true;
        for (var i = 0; i < numberOfParentUnits; i++) {
            var parentUnit = units[parentUnitsFullNames[i]];
            var parentUnitTemplateFilePath = parentUnit.templateFilePath;
            if (parentUnitTemplateFilePath) {
                var parentUnitContent = readFile(parentUnitTemplateFilePath);
                if (!parentUnitContent) {
                    var msg = "Cannot read template '" + parentUnitTemplateFilePath + "' of unit '"
                              + parentUnit.fullName + "'.";
                    log.error(msg);
                    throw new Error(msg);
                }
                var parentUnitCompiledTemplate = handlebarsEnvironment.compile(parentUnitContent);
                var parentUnitHtml = parentUnitCompiledTemplate(templateContext,
                                                                templateOptions).trim();
                if (!returningHtml && (parentUnitHtml.length > 0)) {
                    // Child unit haven't given any "returning" HTML.
                    returningHtml = parentUnitHtml;
                }
            }
        }
        runtimeData.isProcessingParentUnits = false;

        // Runtime data updating.
        processingUnitsStack.pop();
        runtimeData.processingZones = prevProcessingZones;
        runtimeData.processingDefZones = prevProcessingDefZones;

        renderingData.renderedUnits.push(processingUnit.fullName);
        return new handlebarsEnvironment.SafeString(returningHtml);
    }

    /**
     * 'zone' Handlebars helper function.
     * @param zoneName {string}
     * @param options {Object}
     * @return {string} empty string
     */
    function zoneHelper(zoneName, options) {
        var currentPage = runtimeData.currentPage;
        var contentProvider;
        if (currentPage) {
            // inside a page
            var unitsStack = runtimeData.processingUnits;
            var unitsStackSize = unitsStack.length;
            if (unitsStackSize > 0) {
                // inside an unit
                contentProvider = unitsStack[unitsStackSize - 1];
            } else {
                // inside a page, but outside any unit
                contentProvider = currentPage;
            }
        } else {
            // inside the layout
            return "";
        }

        var currentZone;
        var zonesStack = runtimeData.processingZones;
        if (zonesStack.length == 0) {
            // This is a top level main-zone.
            var zonesTree = renderingData.zonesTree;
            currentZone = zonesTree.getTopLevelZone(zoneName);
            if (!currentZone) {
                currentZone = new Zone(zoneName, currentPage);
                zonesTree.addTopLevelZone(currentZone);
            }
        } else {
            // This is a sub-zone.
            // {{#zone "mainZoneName"}} ... {{#zone "subZoneName"}} ... {{/zone}} ... {{/zone}}
            var mainZone = zonesStack[zonesStack.length - 1];
            currentZone = mainZone.getSubZone(zoneName);
            if (!currentZone) {
                currentZone = new Zone(zoneName, currentPage);
                mainZone.addSubZone(currentZone);
            }
        }
        if (currentZone.owner.fullName != currentPage.fullName) {
            // This zone already filled (owned) by a previously processed page.
            return "";
        }

        var isOverride = parseBoolean(options.hash["override"], true);
        zonesStack.push(currentZone);
        if (currentZone.addContentProvider(contentProvider)) {
            // newly added content
            currentZone.addContentForcefully(contentProvider, isOverride, options.fn(this));
        } else {
            if (runtimeData.isProcessingParentUnits) {
                if (currentZone.canAddContent()) {
                    currentZone.addContent(contentProvider, isOverride, options.fn(this));
                }
            } else {
                currentZone.addContentForcefully(contentProvider, isOverride, options.fn(this));
            }
        }
        zonesStack.pop();
        return "";
    }

    /**
     * 'resource' Handlebars helper function.
     * @param type {string} resource type
     * @param path {string} resource file path
     * @param options {Object}
     * @returns {string}
     */
    function resourceHelper(type, path, options) {
        var resourceProvider;
        if (runtimeData.currentPage) {
            // inside a page
            var unitsStack = runtimeData.processingUnits;
            var unitsStackSize = unitsStack.length;
            if (unitsStackSize > 0) {
                // inside an unit
                resourceProvider = unitsStack[unitsStackSize - 1];
            } else {
                // inside a page, but outside any unit
                resourceProvider = runtimeData.currentPage;
            }
        } else {
            // inside the layout
            throw new Error("'" + type
                            + "' Handlebars helper should be used inside a page or an unit.");
        }
        var zonesStack = runtimeData.processingZones;
        if (zonesStack.length != 1) {
            throw new Error("'" + type
                            + "' Handlebars helper should be used inside a top level zone.");
        }

        zonesStack[0].addResource(type, resourceProvider, (resourceProvider.fullName + path),
                                  parseBoolean(options.hash["combine"], true));
        return "";
    }

    /**
     * 'defineZone' Handlebars helper function.
     * @param zoneName {string}
     * @param options {Object}
     * @return {SafeString}
     */
    function defineZoneHelper(zoneName, options) {

        var currentZone, zoneHtml;
        var zonesStack = runtimeData.processingDefZones;
        var zonesStackSize = zonesStack.length;
        if (zonesStackSize == 0) {
            // This is a top level main-zone.
            currentZone = renderingData.zonesTree.getTopLevelZone(zoneName);
        } else {
            // This is a sub-zone.
            // {{#defineZone "A"}} {{#defineZone "B"}} ... {{/defineZone}} {{/defineZone}}
            var lastZone = zonesStack[zonesStackSize - 1];
            currentZone = (lastZone) ? lastZone.getSubZone(zoneName) : null;
        }

        zonesStack.push(currentZone);
        if (currentZone) {
            var optionsData = options.data;
            var currentContentProviderFullName = (optionsData) ? optionsData._uuf_ccpfn : null;
            if (currentContentProviderFullName) {
                var contents = currentZone.getContents(currentContentProviderFullName);
                if (contents) {
                    if (currentZone.hasSubZones()) {
                        var numberOfContents = contents.length;
                        var tmpBuffer = [];
                        for (var n = 0; n < numberOfContents; n++) {
                            optionsData._uuf_cci = n;
                            if (options.fn) {
                                tmpBuffer.push(options.fn(this, optionsData));
                            }
                            tmpBuffer.push(contents[n]);
                        }
                        zoneHtml = tmpBuffer.join("");
                    } else {
                        var currentContentIndex = optionsData._uuf_cci;
                        if (currentContentIndex != null) {
                            zoneHtml = contents[currentContentIndex];
                        } else {
                            zoneHtml = contents.reverse().join("");
                        }
                    }
                } else {
                    zoneHtml = "";
                }
            } else {
                var contentProviders = currentZone.getContentProviders().sort(compareUiComponents);
                var numberOfContentProviders = contentProviders.length;
                if (currentZone.hasSubZones()) {
                    var moreOptionsData = {_uuf_ccpfn: null, _uuf_cci: null};
                    var moreOptions = {data: moreOptionsData};
                    var subZonesBuffer = [];
                    for (var i = 0; i < numberOfContentProviders; i++) {
                        var contentProviderFullName = contentProviders[i].fullName;
                        moreOptionsData._uuf_ccpfn = contentProviderFullName;
                        var contents = currentZone.getContents(contentProviderFullName);
                        var numberOfContents = contents.length;
                        var tmpBuffer = [];
                        for (var j = 0; j < numberOfContents; j++) {
                            moreOptionsData._uuf_cci = j;
                            if (options.fn) {
                                tmpBuffer.push(options.fn(this, moreOptions));
                            }
                            tmpBuffer.push(contents[j]);
                        }
                        subZonesBuffer.push(tmpBuffer.join(""));
                    }
                    zoneHtml = subZonesBuffer.join("");
                } else {
                    var mainZoneBuffer = [];
                    for (var k = 0; k < numberOfContentProviders; k++) {
                        var contents = currentZone.getContents(contentProviders[k].fullName);
                        mainZoneBuffer.push(contents.reverse().join(""));
                    }
                    zoneHtml = mainZoneBuffer.join("");
                }
            }

            // process resources
            if (currentZone.hasResources()) {
                var publicUri = renderingData.context.appData.uri
                                + constants.DIRECTORY_APP_UNIT_PUBLIC + "/";
                var resourcesBuffer = [];
                var cssResources = currentZone.getResources("css");
                if (cssResources) {
                    var cssResourcesPaths = getResourcesPaths(cssResources);
                    var numberOfCssResourcesPaths = cssResourcesPaths.length;
                    for (var p = 0; p < numberOfCssResourcesPaths; p++) {
                        resourcesBuffer.push('<link href="', publicUri, cssResourcesPaths[p],
                                             '" rel="stylesheet" type="text/css" />');
                    }
                }
                var jsResources = currentZone.getResources("js");
                if (jsResources) {
                    var jsResourcesPaths = getResourcesPaths(jsResources);
                    var numberOfJsResourcesPaths = jsResourcesPaths.length;
                    for (var q = 0; q < numberOfJsResourcesPaths; q++) {
                        resourcesBuffer.push('<script src="', publicUri, jsResourcesPaths[q],
                                             '"></script>');
                    }
                }
                // HTML comes after resources.
                resourcesBuffer.push(zoneHtml);
                zoneHtml = resourcesBuffer.join("");
            }
        } else {
            // default value
            zoneHtml = (options.fn) ? options.fn(this) : "";
        }
        zonesStack.pop();
        return new handlebarsEnvironment.SafeString(zoneHtml);
    }

    handlebarsEnvironment.registerHelper({
        page: pageHelper,
        unit: unitHelper,
        zone: zoneHelper,
        css: function (path, options) {
            return resourceHelper("css", path, options)
        },
        js: function (path, options) {
            return resourceHelper("js", path, options)
        },
        defineZone: defineZoneHelper
    });
    return handlebarsEnvironment;
}