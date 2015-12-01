/**
 * Page rendering data.
 * @typedef {{
 *     context: {appData: {name: string, context: string, conf: Object}, uriData: {uri:
 *     string, params: Object.<string, string>}, user: User}, pageData: {page: UIComponent,
 *     pageUri: string}, zonesTree: ZoneTree, renderedUnits: string[]}} RenderingData
 */

/**
 * Routes a HTTP request which requests a dynamic page.
 * @param request {Object} HTTP request to be processed
 * @param response {Object} HTTP response to be served
 */
var route;

(function () {
    var log = new Log("dynamic-file-router");
    var constants = require("constants.js").constants;
    /** @type {UtilsModule} */
    var Utils = require("utils.js");

    /**
     * Returns the Handlebars environment.
     * @param renderingData {RenderingData} rendering data
     * @param lookupTable {LookupTable} lookup table
     * @return {Object} Handlebars environment
     */
    function getHandlebarsEnvironment(renderingData, lookupTable) {
        var rhh = require("rendering-handlebars-helpers.js");
        return rhh.registerHelpers(renderingData, lookupTable);
    }

    /**
     *
     * @param pageUri {string} page path requested in the URL
     * @param lookupTable {LookupTable} lookup table
     * @return {{page: UIComponent, uriParams: Object.<string, string>}|null}
     *     if exists full name, URI params and page of the specified URI, otherwise
     *     <code>null</code>
     */
    function getPageData(pageUri, lookupTable) {
        var uriPagesMap = lookupTable.uriPagesMap;
        var uriMatcher = new URIMatcher(pageUri);
        var uriPatterns = Object.keys(uriPagesMap);
        var numberOfUriPatterns = uriPatterns.length;

        for (var i = 0; i < numberOfUriPatterns; i++) {
            var uriPattern = uriPatterns[i];
            if (uriMatcher.match(uriPattern)) {
                return {
                    page: lookupTable.pages[uriPagesMap[uriPattern]],
                    uriParams: uriMatcher.elements()
                };
            }
        }
        // No page found
        return null;
    }

    /**
     * Whether the specified page is processable or not.
     * @param pageData {{page: UIComponent, pageUri: string}} data of the page to be checked
     * @param user {User} current user
     * @param appConfigs {Object} application configurations
     * @param request {Object} HTTP request
     * @param response {Object} HTTP response
     * @return {boolean} <code>true</code> if processable, otherwise <code>false</code>
     */
    function isPageProcessable(pageData, user, appConfigs, request, response) {
        var pageDefinition = pageData.page.definition;
        if (Utils.parseBoolean(pageDefinition[constants.UI_COMPONENT_DEFINITION_DISABLED], false)) {
            // This page is disabled.
            response.sendError(404, "Requested page '" + pageData.pageUri + "' does not exists.");
            return false;
        }

        if (Utils.parseBoolean(pageDefinition[constants.PAGE_DEFINITION_IS_ANONYMOUS], false)) {
            // This is an anonymous page. So no need for an user session or checking permissions.
            return true;
        } else {
            // This is not an anonymous page.
            if (user) {
                // An user has logged in.
                var pagePermissions = pageDefinition[constants.UI_COMPONENT_DEFINITION_PERMISSIONS];
                if (pagePermissions && Array.isArray(pagePermissions)) {
                    // A permissions array is specified in the page definition.
                    var numberOfUnitPermissions = pagePermissions.length;
                    var userPermissionsMap = user.permissions;
                    for (var i = 0; i < numberOfUnitPermissions; i++) {
                        if (!userPermissionsMap.hasOwnProperty(pagePermissions[i])) {
                            // User does not have this permission.
                            if (log.isDebugEnabled()) {
                                log.debug("User '" + user.username + "' in domain '" + user.domain
                                          + "' does not have permission '" + pagePermissions[i]
                                          + "' to view page '" + pageData.page.fullName + "'.");
                            }
                            response.sendError(403, "You do not have enough permissions to access "
                                                    + "the requested page '" + pageData.pageUri
                                                    + "'.");
                            return false;
                        }
                    }
                    // User has all permissions.
                    return true;
                } else {
                    // Permissions are not specified in the page definition.
                    return true;
                }
            } else {
                // Currently no user has logged in. So redirect to the login page.
                var loginUri = appConfigs[constants.APP_CONF_LOGIN_URI];
                if (loginUri) {
                    response.sendRedirect(loginUri);
                } else {
                    response.sendRedirect(request.getContextPath() + "/s");
                }
                return false;
            }
        }
    }

    /**
     *
     * @param renderingData {RenderingData} page rendering data
     * @param lookupTable {LookupTable} lookup table
     * @return {string}
     */
    function getPushedUnitsHandlebarsTemplate(renderingData, lookupTable) {
        var uriMatcher = new URIMatcher(renderingData.pageData.pageUri);
        var pushedUnits = lookupTable.pushedUnits;
        var uriPatterns = Object.keys(pushedUnits);
        var numberOfUriPatterns = uriPatterns.length;
        var buffer = [];
        for (var i = 0; i < numberOfUriPatterns; i++) {
            var uriPattern = uriPatterns[i];
            if (uriMatcher.match(uriPattern)) {
                buffer.push('{{unit "', pushedUnits[uriPattern].join('"}}{{unit "'), '" }}');
            }
        }
        return (buffer.length == 0) ? null : buffer.join("");
    }

    /**
     *
     * @param renderingData {RenderingData} page rendering data
     * @param lookupTable {LookupTable} lookup table
     * @param handlebarsEnvironment {Object} Handlebars environment
     * @param response {Object} HTTP response
     */
    function renderPage(renderingData, lookupTable, handlebarsEnvironment, response) {
        var page = renderingData.pageData.page;
        var buffer = ['{{#page "', page.fullName, '"}}'];
        var pushedUnitsHbsTemplate = getPushedUnitsHandlebarsTemplate(renderingData, lookupTable);
        if (pushedUnitsHbsTemplate) {
            buffer.push(' {{#zone "_pushedUnits"}} ', pushedUnitsHbsTemplate, ' {{/zone}} ');
        }
        buffer.push('{{/page}}');

        try {
            var compiledTemplate = handlebarsEnvironment.compile(buffer.join(""));
            response.addHeader("Content-type", "text/html");
            // We don't want web browsers to cache dynamic HTML pages.
            // Adopted from http://stackoverflow.com/a/2068407/1577286
            response.addHeader("Cache-Control", "no-cache, no-store, must-revalidate");
            response.addHeader("Pragma", "no-cache");
            response.addHeader("Expires", "0");
            print(compiledTemplate({}));
        } catch (e) {
            if ((typeof e) == "string") {
                //JS "throw message" type errors
                log.error(e);
                response.sendError(500, e);
            } else {
                if (e.stack) {
                    //Java/Rhino Exceptions
                    log.error(e);
                    response.sendError(500, e.message);
                } else if (e.message) {
                    //JS "throw new Error(message)" type errors
                    var err = new Error();
                    log.info(err.stack);
                    log.error(e.message);
                    response.sendError(500, e.message);
                }
            }
        }
    }

    route = function (request, response) {
        var configurations = Utils.getConfigurations();
        /** @type {LookupTable} */
        var lookupTable = Utils.getLookupTable(configurations);

        // Lets assume URL looks like https://my.domain.com/appName/{foo}/{bar}/...
        var requestUri = request.getRequestURI(); // /appName/{foo}/{bar}/...
        var pageUri = requestUri.substring(requestUri.indexOf("/", 1)); // /{foo}/{bar}/...

        var pageData = getPageData(pageUri, lookupTable);
        // TODO: decide whether this page or its furthest child is rendered
        if (!pageData) {
            response.sendError(404, "Requested page '" + pageUri + "' does not exists.");
            return;
        }

        var currentUser = Utils.getCurrentUser();
        var appConfigurations = Utils.getAppConfigurations();
        if (!isPageProcessable(pageData, currentUser, appConfigurations, request, response)) {
            return;
        }

        /** @type {RenderingData} */
        var renderingData = {
            context: {
                appData: {
                    name: appConfigurations[constants.APP_CONF_APP_NAME],
                    context: ((request.getContextPath() == "/") ? "" : request.getContextPath()),
                    conf: appConfigurations
                },
                uriData: {
                    uri: requestUri,
                    params: pageData.uriParams
                },
                user: currentUser
            },
            pageData: {
                page: pageData.page,
                pageUri: pageUri
            },
            /** @type {ZoneTree} */
            zonesTree: null,
            renderedUnits: []
        };
        var handlebarsEnvironment = getHandlebarsEnvironment(renderingData, lookupTable);
        renderPage(renderingData, lookupTable, handlebarsEnvironment, response);
        //print(stringify(renderingData));
    };
})();
