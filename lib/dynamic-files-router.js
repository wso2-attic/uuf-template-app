/**
 * Page rendering data.
 * @typedef {{
 *     context: {appData: {name: string, uri: string}, uriData: {uri: string, params:
 *     Object.<string, string>}}, pageData: {page: UIComponent, pageUri: string,},
 *     zones: Object.<string, {providedBy: string, buffers: Object.<string, string[]>}>
 *         }} RenderingData
 */

/**
 * Routes a HTTP request which requests a dynamic page.
 * @param request {Object} HTTP request
 * @param response {Object} HTTP response
 * @param lookUpTable {LookupTable} lookup table
 * @param configs {Object} application configurations
 */
var route;

(function () {

    var log = new Log("[dynamic-file-router]");
    var constants = require("constants.js").constants;

    /**
     * Returns the Handlebars environment.
     * @param renderingData {RenderingData} rendering data
     * @param lookupTable {LookupTable} lookup table
     * @param configs {Object} application configurations
     * @return {Object} Handlebars environment
     */
    function getHandlebarsEnvironment(renderingData, lookupTable, configs) {
        var rhh = require("rendering-handlebars-helpers.js");
        return rhh.registerHelpers(renderingData, lookupTable, configs);
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
     *
     * @param renderingData {RenderingData} page rendering data
     * @param lookupTable {LookupTable} lookup table
     * @return {string}
     */
    function getPushedUnitsTemplate(renderingData, lookupTable) {
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
        return (buffer.join(""));
    }

    /**
     *
     * @param renderingData {RenderingData} page rendering data
     * @param lookupTable {LookupTable} lookup table
     * @param handlebarsEnvironment {Object} Handlebars environment
     * @param response {Object} HTTP response
     * @return {boolean}
     */
    function renderPage(renderingData, lookupTable, handlebarsEnvironment, response) {
        var page = renderingData.pageData.page;
        var buffer = ['{{#page "', page.fullName, '"}}'];
        var pushedUnitsTemplate = getPushedUnitsTemplate(renderingData, lookupTable);
        if (pushedUnitsTemplate) {
            buffer.push(' {{#zone "PUSHED-UNITS"}} ', pushedUnitsTemplate, ' {{/zone}} ');
        }
        buffer.push('{{/page}}');
        var pageTemplate = handlebarsEnvironment.compile(buffer.join(""));
        try {
            pageTemplate({});
        } catch (e) {
            log.error(e);
            response.sendError(500, e.message);
            return false;
        }
        return true;
    }

    /**
     *
     * @param renderingData {RenderingData} page rendering data
     * @param lookupTable {LookupTable} lookup table
     * @param handlebarsEnvironment {Object} Handlebars environment
     * @param response {Object} HTTP response
     */
    function renderLayout(renderingData, lookupTable, handlebarsEnvironment, response) {
        /** @type {UIComponent} */
        var page = renderingData.pageData.page;
        var layoutFullName = page.definition[constants.PAGE_DEFINITION_LAYOUT];
        var layoutFile = new File((lookupTable.layouts[layoutFullName]).path);
        var layoutContent = null;
        try {
            layoutFile.open('r');
            layoutContent = layoutFile.readAll();
            layoutFile.close();
        } catch (e) {
            var msg = "Cannot read layout '" + layoutFullName + "' of page '" + page.fullName + ".";
            log.error(msg);
            log.error(e);
            response.sendError(500, msg);
            return;
        }

        // TODO: implement a proper caching mechanism for 'layoutTemplate'
        var layoutTemplate = handlebarsEnvironment.compile(layoutContent);
        response.addHeader("Content-type", "text/html");
        try {
            print(layoutTemplate({}));
        } catch (e) {
            log.error(e);
        }
    }

    /**
     * Routes a HTTP request which requests a dynamic page.
     * @param request {Object} HTTP request
     * @param response {Object} HTTP response
     * @param lookupTable {LookupTable} lookup table
     * @param configs {Object} application configurations
     */
    route = function (request, response, lookupTable, configs) {
        // lets assume URL looks like https://my.domain.com/app/{one}/{two}/{three}/{four}
        var uri = request.getRequestURI(); // = /app/{one}/{two}/{three}/{four}
        var positionOfSecondSlash = uri.indexOf("/", 1);
        var pageUri = uri.substring(positionOfSecondSlash); // /{one}/{two}/{three}/{four}

        var pageData = getPageData(pageUri, lookupTable);
        // TODO: decide whether this page or its furthest child is rendered
        if (!pageData) {
            response.sendError(404, "Requested page '" + pageUri + "' does not exists.");
            return;
        }

        /** @type {RenderingData} */
        var renderingData = {
            context: {
                appData: {
                    name: uri.substring(1, positionOfSecondSlash),
                    uri: request.getContextPath()
                },
                uriData: {
                    uri: uri,
                    params: pageData.uriParams
                }
            },
            pageData: {
                page: pageData.page,
                pageUri: pageUri
            },
            /**
             * @type {Object.<string, Object.<string, {mainZoneData: {isOverridden: boolean,
             *     buffer: string[]}, subZonesData: Object.<string, {isOverridden: boolean, buffer:
             *     string[]}>}>>}
             */
            zones: {},
            renderedUnits: []
        };
        var handlebarsEnvironment = getHandlebarsEnvironment(renderingData, lookupTable, configs);
        if (!renderPage(renderingData, lookupTable, handlebarsEnvironment, response)) {
            // something went wrong
            return;
        }
        renderLayout(renderingData, lookupTable, handlebarsEnvironment, response);

        //print(stringify(renderingData));
    };

})();
