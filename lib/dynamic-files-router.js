/**
 * Page rendering data.
 * @typedef {{
 *     context: {appData: {name: string, uri: string}, uriData: {uri: string, params:
 *     Object.<string, string>}}, pageData: {page: UIComponent, pageUri: string},
 *     zonesTree: ZoneTree, renderedUnits: string[]}} RenderingData
 */

/**
 * Routes a HTTP request which requests a dynamic page.
 * @param request {Object} HTTP request to be processed
 * @param response {Object} HTTP response to be served
 * @param lookupTable {LookupTable} lookup table
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
            print(compiledTemplate({}));
        } catch (e) {
            log.error(e);
            response.sendError(500, e.message);
        }
    }

    /**
     * Routes a HTTP request which requests a dynamic page.
     * @param request {Object} HTTP request to be processed
     * @param response {Object} HTTP response to be served
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
            /** @type {ZoneTree} */
            zonesTree: null,
            renderedUnits: []
        };
        var handlebarsEnvironment = getHandlebarsEnvironment(renderingData, lookupTable, configs);
        renderPage(renderingData, lookupTable, handlebarsEnvironment, response);
        //print(stringify(renderingData));
    };
})();
