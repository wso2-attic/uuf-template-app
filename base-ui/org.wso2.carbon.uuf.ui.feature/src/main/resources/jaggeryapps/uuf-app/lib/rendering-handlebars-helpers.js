/**
 * Returns the Handlebars environment.
 * @param renderingData {RenderingData} rendering data
 * @param lookupTable {LookupTable} lookup table
 * @return {Object} Handlebars environment
 */
function registerHelpers(renderingData, lookupTable) {
    var log = new Log("rendering-handlebars-helpers");
    var constants = require("constants.js").constants;
    /** @type {UtilsModule} */
    var Utils = require("utils.js");
    var parseBoolean = Utils.parseBoolean;
    var getFurthestChild = Utils.getFurthestChild;

    var dataStructures = require("data-structures.js");
    var Zone = dataStructures.Zone;
    var ZoneContent = dataStructures.ZoneContent;
    renderingData.zonesTree = new dataStructures.ZoneTree();

    /**
     * Holds runtime data.
     * @type {{currentPage: UIComponent, processingUnits: UIComponent[], processingZones:
     *     ZoneContent[], processingDefZones: ZoneContent[]}}
     */
    var runtimeData = {
        currentPage: null,
        processingUnits: [],
        processingZones: [],
        processingDefZones: []
    };
    var handlebarsEnvironment = require(constants.MODULE_HANDLEBARS).Handlebars;

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
     * Returns the currently processing UI Component.
     * @param runtimeData {Object} runtime data
     * @returns {?UIComponent} currently processing UI Component
     */
    function getProcessingUiComponent(runtimeData) {
        var currentPage = runtimeData.currentPage;
        if (currentPage) {
            // inside a page
            var unitsStack = runtimeData.processingUnits;
            var unitsStackSize = unitsStack.length;
            if (unitsStackSize > 0) {
                // inside an unit
                return unitsStack[unitsStackSize - 1];
            } else {
                // inside a page, but outside any unit
                return currentPage;
            }
        } else {
            // outside of page
            return null;
        }
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
            var firstResourceType = sortedResources[0].type;
            var extension = (firstResourceType == "less") ? "css" : firstResourceType;
            var crp = combiningResourcesPaths.join(constants.COMBINED_RESOURCES_SEPARATOR);
            singleResourcesPaths.push(crp + constants.COMBINED_RESOURCES_URL_TAIL + extension);
        }
        return singleResourcesPaths;
    }

    /**
     * Whether the specified unit is processable or not.
     * @param unit {UIComponent} unit to be checked
     * @param user {User} current user
     * @return {boolean} <code>true</code> if processable, otherwise <code>false</code>
     */
    function isUnitProcessable(unit, user) {
        var unitDefinition = unit.definition;
        if (parseBoolean(unitDefinition[constants.UI_COMPONENT_DEFINITION_DISABLED], false)) {
            return false;
        }

        var unitPermissions = unitDefinition[constants.UI_COMPONENT_DEFINITION_PERMISSIONS];
        if (user && unitPermissions && Array.isArray(unitPermissions)) {
            var numberOfUnitPermissions = unitPermissions.length;
            var userPermissionsMap = user.permissions;
            for (var i = 0; i < numberOfUnitPermissions; i++) {
                if (!userPermissionsMap.hasOwnProperty(unitPermissions[i])) {
                    if (log.isDebugEnabled()) {
                        log.debug("User '" + user.username + "' in domain '" + user.domain
                                  + "' does not have permission '" + unitPermissions[i]
                                  + "' to view unit '" + unit.fullName + "'.");
                    }
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Executes the JS script of the specified UI Component and returns the result.
     * @param uiComponent {UIComponent} UI component to be processed
     * @param scriptContext {Object} script context
     * @param lookupTable {LookupTable} lookup table
     * @returns {Object} return value
     */
    function executeScript(uiComponent, scriptContext, lookupTable) {
        var scriptFunctionName = constants.UI_COMPONENT_JS_FUNCTION_ON_REQUEST;
        var uiComponents = lookupTable.uiComponents;

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
        var parentComponentsFullNames = uiComponent.parents;
        var numberOfParentComponents = parentComponentsFullNames.length;
        for (var i = 0; i < numberOfParentComponents; i++) {
            var parentScriptFilePath = uiComponents[parentComponentsFullNames[i]].scriptFilePath;
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

        if (!scriptFilePath) {
            // No script found.
            return {};
        }

        try {
            var script = require(scriptFilePath);
            script.super = superScript;
            script.getFile = function (relativeFilePath) {
                return Utils.getFileInUiComponent(uiComponent, relativeFilePath, lookupTable);
            };
            var rv = script[constants.UI_COMPONENT_JS_FUNCTION_ON_REQUEST](scriptContext);
            return (rv) ? rv : {};
        } catch (e) {
            log.error("An exception thrown when executing the script '" + scriptFilePath + "'.");
            throw e;
        }
    }

    /**
     * 'page' Handlebars helper function.
     * @param mentionedPageFullName {string}
     * @param options {Object}
     * @return {string} empty string
     */
    function pageHelper(mentionedPageFullName, options) {
        var pages = lookupTable.pages;
        var mentionedPage = pages[mentionedPageFullName];
        if (!mentionedPage) {
            var msg = "Page '" + mentionedPageFullName + "' does not exists.";
            log.error(msg);
            throw new Error(msg);
        }

        var processingPage = getFurthestChild(mentionedPage, lookupTable);
        if (log.isDebugEnabled() && (mentionedPage.fullName != processingPage.fullName)) {
            log.debug("Page '" + processingPage.fullName + "' is processed for page '"
                      + mentionedPage.fullName + "'.");
        }

        // Start processing page.
        runtimeData.currentPage = processingPage;

        // Execute the script and get the template context.
        var appName = renderingData.context.appData.name;
        var appContext = renderingData.context.appData.context;
        var appConf = renderingData.context.appData.conf;
        var optionsHash = options.hash;
        var optionsHashParams = optionsHash[constants.HELPER_PARAM_PARAMS];
        var pageParams = (optionsHashParams) ? optionsHashParams : optionsHash;
        var pagePublicUri = renderingData.context.appData.context + "/"
                            + constants.DIRECTORY_APP_UNIT_PUBLIC + "/" + processingPage.fullName;
        var uriParams = renderingData.context.uriData.params;
        var user = renderingData.context.user;
        var scriptContext = {
            app: {name: appName, context: appContext, conf: appConf},
            page: {params: pageParams, publicUri: pagePublicUri},
            uriParams: uriParams,
            user: user,
            handlebars: handlebarsEnvironment
        };
        var templateContext = executeScript(processingPage, scriptContext, lookupTable);
        // Additional parameters to the template context.
        var templateOptions = {
            data: {
                app: {name: appName, context: appContext, conf: appConf},
                page: {params: pageParams, publicUri: pagePublicUri},
                uriParams: uriParams,
                user: user
            }
        };

        // If has inner HTMl, then process it.
        if (options.fn) {
            // {{#page "pageName"}} {{#zone "_pushedUnits"}} ... {{/zone}} {{/page}}
            options.fn(templateContext, templateOptions);
        }
        // Get this page's template.
        var pageTemplateFilePath = processingPage.templateFilePath;
        if (pageTemplateFilePath) {
            var pageContent = readFile(pageTemplateFilePath);
            if (!pageContent) {
                var msg = "Cannot read template '" + pageTemplateFilePath + "' of page '"
                          + processingPage.fullName + "'.";
                log.error(msg);
                throw new Error(msg);
            }
            handlebarsEnvironment.compile(pageContent)(templateContext, templateOptions);
        }
        // Process parents' templates from nearest to furthest.
        var parentPagesFullNames = processingPage.parents;
        var numberOfParentPages = parentPagesFullNames.length;
        for (var i = 0; i < numberOfParentPages; i++) {
            var parentPage = pages[parentPagesFullNames[i]];
            runtimeData.currentPage = parentPage;
            var parentPageTemplateFilePath = parentPage.templateFilePath;
            if (parentPageTemplateFilePath) {
                var parentPageContent = readFile(parentPageTemplateFilePath);
                if (!parentPageContent) {
                    var msg = "Cannot read template '" + parentPageTemplateFilePath + "' of page '"
                              + parentPage.fullName + "'.";
                    log.error(msg);
                    throw new Error(msg);
                }
                handlebarsEnvironment.compile(parentPageContent)(templateContext, templateOptions);
            }
        }
        runtimeData.currentPage = processingPage;

        // Process layout.
        var layoutName = processingPage.definition[constants.PAGE_DEFINITION_LAYOUT];
        var layoutPath = lookupTable.layouts[layoutName].path;
        var layoutContent = readFile(layoutPath);
        if (!layoutContent) {
            var msg = "Cannot read layout '" + layoutName + "' from path '" + layoutPath
                      + "' of page '" + processingPage.fullName + "'.";
            log.error(msg);
            throw new Error(msg);
        }
        var html = handlebarsEnvironment.compile(layoutContent)(templateContext, templateOptions);
        runtimeData.currentPage = null;
        // Finished processing page.

        return html;
    }

    /**
     * 'unit' Handlebars helper function.
     * @param mentionedUnitFullName {string}
     * @param options {Object}
     * @return {SafeString}
     */
    function unitHelper(mentionedUnitFullName, options) {
        var units = lookupTable.units;
        var mentionedUnit = units[mentionedUnitFullName];
        if (!mentionedUnit) {
            var msg = "Unit '" + mentionedUnitFullName + "' does not exists.";
            log.error(msg);
            throw new Error(msg);
        }

        var processingUnit = getFurthestChild(mentionedUnit, lookupTable);
        var currentUser = renderingData.context.user;
        if (!isUnitProcessable(processingUnit, currentUser)) {
            return new handlebarsEnvironment.SafeString("");
        }

        if (log.isDebugEnabled() && (mentionedUnit.fullName != processingUnit.fullName)) {
            log.debug("Unit '" + processingUnit.fullName + "' is processed for unit '"
                      + mentionedUnit.fullName + "'.");
        }

        var processingUnitsStack = runtimeData.processingUnits;
        // Backup current 'zones' stack and set a new stack.
        var prevProcessingZones = runtimeData.processingZones;
        runtimeData.processingZones = [];
        // Backup current 'defineZones' stack and set a new stack.
        var prevProcessingDefZones = runtimeData.processingDefZones;
        runtimeData.processingDefZones = [];

        // Start processing unit 'processingUnit'.
        processingUnitsStack.push(processingUnit);

        // Execute the script and get the template context.
        var appName = renderingData.context.appData.name;
        var appContext = renderingData.context.appData.context;
        var appConf = renderingData.context.appData.conf;
        var optionsHash = options.hash;
        var optionsHashParams = optionsHash[constants.HELPER_PARAM_PARAMS];
        var unitParams = (optionsHashParams) ? optionsHashParams : optionsHash;
        var unitPublicUri = renderingData.context.appData.context + "/"
                            + constants.DIRECTORY_APP_UNIT_PUBLIC + "/" + processingUnit.fullName;
        var uriParams = renderingData.context.uriData.params;
        var user = renderingData.context.user;
        var scriptContext = {
            app: {name: appName, context: appContext, conf: appConf},
            unit: {params: unitParams, publicUri: unitPublicUri},
            uriParams: uriParams,
            user: user,
            handlebars: handlebarsEnvironment
        };
        var templateContext = executeScript(processingUnit, scriptContext, lookupTable);
        // Additional parameters to the template context.
        var templateOptions = {
            data: {
                app: {name: appName, context: appContext, conf: appConf},
                unit: {params: unitParams, publicUri: unitPublicUri},
                uriParams: uriParams,
                user: user
            }
        };

        var returningHtml = "";
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
                if ((returningHtml.length == 0) && (parentUnitHtml.length > 0)) {
                    // Child unit haven't given any "returning" HTML.
                    returningHtml = parentUnitHtml;
                }
            }
        }
        processingUnitsStack.pop();
        renderingData.renderedUnits.push(processingUnit.fullName);
        // Finished processing unit 'processingUnit'.

        // Restore 'zones' stack and 'defineZones' stack.
        runtimeData.processingZones = prevProcessingZones;
        runtimeData.processingDefZones = prevProcessingDefZones;

        return new handlebarsEnvironment.SafeString(returningHtml);
    }

    /**
     * 'zone' Handlebars helper function.
     * @param zoneName {string}
     * @param options {Object}
     * @return {string} empty string
     */
    function zoneHelper(zoneName, options) {
        var contentProvider = getProcessingUiComponent(runtimeData);
        if (!contentProvider) {
            // 'zone' helper is called outside of a page.
            return "";
        }

        var currentZoneContent;
        var zonesStack = runtimeData.processingZones;
        if (zonesStack.length == 0) {
            // This is a top level main-zone.
            var currentPage = runtimeData.currentPage;
            var zonesTree = renderingData.zonesTree;
            var mainZone = zonesTree.getTopLevelZone(zoneName);
            if (mainZone) {
                if (mainZone.owner.fullName != currentPage.fullName) {
                    // This zone already filled (owned) by a previously processed page.
                    return "";
                }
                var mainZoneContentsOfProvider = mainZone.getContents(contentProvider.fullName);
                if (mainZoneContentsOfProvider
                    && mainZoneContentsOfProvider[mainZoneContentsOfProvider.length
                                                  - 1].isOverridden) {
                    // Previously processed child of 'contentProvider' has overridden this main-zone
                    return "";
                }
            } else {
                mainZone = new Zone(zoneName, currentPage);
                zonesTree.addTopLevelZone(mainZone);
            }
            currentZoneContent = new ZoneContent(zoneName, contentProvider);
            mainZone.addContent(currentZoneContent);
        } else {
            // This is a sub-zone.
            // {{#zone "parentZoneName"}} ... {{#zone "subZoneName"}} ... {{/zone}} ... {{/zone}}
            var parentZoneContent = zonesStack[zonesStack.length - 1];
            currentZoneContent = new ZoneContent(zoneName, contentProvider);
            parentZoneContent.addSubZoneContent(zoneName, currentZoneContent);
        }

        var isOverride = parseBoolean(options.hash[constants.HELPER_PARAM_OVERRIDE], true);
        zonesStack.push(currentZoneContent);
        currentZoneContent.isOverridden = isOverride;
        currentZoneContent.addContent(options.fn(this));
        zonesStack.pop();
        return "";
    }

    /**
     * 'resource' Handlebars helper function.
     * @param type {string} resource type
     * @param path {string} resource file path
     * @param options {Object}
     * @returns {string} empty string
     */
    function resourceHelper(type, path, options) {
        var resourceProvider = getProcessingUiComponent(runtimeData);
        if (!resourceProvider) {
            // 'resource' helper is called outside of a page.
            throw new Error("'" + type
                            + "' Handlebars helper should be used inside a page or an unit.");
        }
        var zonesStack = runtimeData.processingZones;
        if (zonesStack.length != 1) {
            throw new Error("'" + type
                            + "' Handlebars helper should be used inside a top level zone.");
        }

        var mainZone = renderingData.zonesTree.getTopLevelZone(zonesStack[0].zoneName);
        var resourcePath = resourceProvider.fullName + "/" + path;
        var isCombine = parseBoolean(options.hash[constants.HELPER_PARAM_COMBINE], true);
        mainZone.addResource(type, resourceProvider, resourcePath, isCombine);
        return "";
    }

    /**
     * 'defineZone' Handlebars helper function.
     * @param zoneName {string}
     * @param options {Object}
     * @return {SafeString}
     */
    function defineZoneHelper(zoneName, options) {
        var zoneHtml, optionsFn = options.fn;

        var zonesStack = runtimeData.processingDefZones;
        var zonesStackSize = zonesStack.length;
        if (zonesStackSize == 0) {
            // This is a top level main-zone.
            var mainZone = renderingData.zonesTree.getTopLevelZone(zoneName);
            if (mainZone) {
                var mainZoneBuffer = [];
                // First process resources in this main-zone.
                if (mainZone.hasResources()) {
                    var publicUri = renderingData.context.appData.context + "/"
                                    + constants.DIRECTORY_APP_UNIT_PUBLIC + "/";
                    var resourcesBuffer = [];
                    var cssResources = mainZone.getResources("css");
                    if (cssResources) {
                        var cssResourcesPaths = getResourcesPaths(cssResources);
                        var numberOfCssResourcesPaths = cssResourcesPaths.length;
                        for (var n = 0; n < numberOfCssResourcesPaths; n++) {
                            resourcesBuffer.push('<link href="', publicUri, cssResourcesPaths[n],
                                                 '" rel="stylesheet" type="text/css" />');
                        }
                    }
                    var jsResources = mainZone.getResources("js");
                    if (jsResources) {
                        var jsResourcesPaths = getResourcesPaths(jsResources);
                        var numberOfJsResourcesPaths = jsResourcesPaths.length;
                        for (var m = 0; m < numberOfJsResourcesPaths; m++) {
                            resourcesBuffer.push('<script src="', publicUri, jsResourcesPaths[m],
                                                 '"></script>');
                        }
                    }
                    mainZoneBuffer.push(resourcesBuffer.join(""));
                }

                // Then process HTML contents of this main-zone.
                var isInProtectedScope, childUnitFullName;
                if (options.hash[constants.HELPER_PARAM_SCOPE] == "protected") {
                    // 'scope' parameter is specified with value 'protected' for this main-zone.
                    var unitsStack = runtimeData.processingUnits;
                    var unitsStackSize = unitsStack.length;
                    if (unitsStackSize > 0) {
                        // Now we are inside an unit. Here 'scope' parameter can be used with
                        // 'defineZone' helper for main-zones.
                        isInProtectedScope = true;
                        // When processing a parent-unit, last element of the units stack contains
                        // its child-unit.
                        childUnitFullName = unitsStack[unitsStackSize - 1].fullName;
                    } else {
                        // Not inside an unit. So 'scope' parameter has no effect.
                        isInProtectedScope = false;
                        childUnitFullName = null;
                    }
                }
                var contentProviders = mainZone.getContentProviders().sort(compareUiComponents);
                var numberOfContentProviders = contentProviders.length;
                for (var i = 0; i < numberOfContentProviders; i++) {
                    var contentProviderFullName = contentProviders[i].fullName;
                    if (isInProtectedScope
                        && (childUnitFullName != contentProviderFullName)) {
                        // Scope of this main-zone is 'protected'. So only contents provided by
                        // child units should be processed. Content provider 'contentProviders[i]'
                        // is not a child-unit of the processing parent-unit.
                        continue;
                    }
                    var contentsOfProvider = mainZone.getContents(contentProviderFullName);
                    var numberOfContentsOfProvider = contentsOfProvider.length;
                    var tmpBuffer = [];
                    for (var j = 0; j < numberOfContentsOfProvider; j++) {
                        var contentOfProvider = contentsOfProvider[j];
                        if (isInProtectedScope && contentOfProvider.expired) {
                            // Scope of this zone is 'protected' and content 'contentOfProvider' is
                            // already processed. So do not process it again.
                            continue;
                        }
                        zonesStack.push(contentOfProvider);
                        if (contentOfProvider.hasSubZones() && optionsFn) {
                            tmpBuffer.push(optionsFn(this));
                        }
                        tmpBuffer.push(contentOfProvider.getContent());
                        if (isInProtectedScope) {
                            contentOfProvider.expired = true;
                            // Scope of this zone is 'protected', so mark this content as 'expired'
                            // since we have finished processing it.
                        }
                        zonesStack.pop();
                    }
                    mainZoneBuffer.push(tmpBuffer.join(""));
                }
                zoneHtml = mainZoneBuffer.join("");
            } else {
                // No content is given for this main-zone. If has, process inner HTML for default
                // content.
                zoneHtml = (optionsFn) ? optionsFn(this) : "";
            }
        } else {
            // This is a sub-zone.
            // {{#defineZone "A"}} {{#defineZone "B"}} ... {{/defineZone}} {{/defineZone}}
            var parentZoneContent = zonesStack[zonesStackSize - 1];
            var zoneContents = parentZoneContent.getSubZoneContents(zoneName);
            if (zoneContents) {
                var numberOfZoneContents = zoneContents.length;
                var subZoneBuffer = [];
                for (var k = 0; k < numberOfZoneContents; k++) {
                    var zoneContent = zoneContents[k];
                    // Here (parentZoneContent.provider == subZoneContent.provider) is true.
                    zonesStack.push(zoneContent);
                    if (zoneContent.hasSubZones() && optionsFn) {
                        subZoneBuffer.push(optionsFn(this));
                    }
                    subZoneBuffer.push(zoneContent.getContent());
                    zonesStack.pop();
                }
                zoneHtml = subZoneBuffer.join("");
            } else {
                // No content is given for this sub-zone. If has, process inner HTML for default
                // content.
                zoneHtml = (optionsFn) ? optionsFn(this) : "";
            }
        }

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