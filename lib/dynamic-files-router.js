/**
 * Routes a dynamic HTTP request.
 * @param request HTTP request
 * @param response HTTP response
 * @param lookUpTable lookup table
 * @param configs application configurations
 */
var route;

(function () {
    var log = new Log("[dynamic-file-router]");
    var constants = (require("constants.js")).constants;

    /**
     * Initialize and returns a Handlebars environment.
     * @param request {Object} current HTTP request
     * @param lookUpTable {{layouts: Object.<string, string>, units: Object.<string, {shortName:
     *     string, path: string, definition: Object}>, pushedUnits: Object.<string, string[]>}}
     *     lookup table
     * @param configs {Object} application configurations
     * @return {Object} Handlebars environment
     */
    function getHandlebarsEnvironment(request, lookUpTable, configs) {
        return (require("rendering-handlebars-helpers.js")).registerHelpers(request, lookUpTable,
                                                                            configs);
    }

    /**
     * Returns a File object to the specified page.
     * @param pageUri {string} page path requested in the URL
     * @return {File} requested page file
     */
    function getPageFile(pageUri) {
        var pagesDirPath = constants.DIRECTORY_APP_PAGES;
        /*
         * Page URI "/foo/bar/foobar" or "/foo/bar/foobar/" can be mapped to following pages.
         *  /foo/bar/foobar.hbs         pathParams = []
         *  /foo/bar/foobar/index.hbs   pathParams = []
         *  /foo/bar.hbs                pathParams = ["foobar"]
         *  /foo/bar/index.hbs          pathParams = ["foobar"]
         *  /foo.hbs                    pathParams = ["foobar", "bar"]
         *  /foo/index.hbs              pathParams = ["foobar", "bar"]
         *  /index.hbs
         */
        if (pageUri[pageUri.length - 1] == "/") {
            // remove last slash, now page URI looks like "/foo/bar/foobar"
            pageUri = pageUri.substring(0, pageUri.length - 1);
        }

        // var pathParams = [];
        do {
            // /app/pages/foo/bar.hbs
            var pageFile = new File(pagesDirPath + "/" + pageUri + ".hbs");
            if (pageFile.isExists()) {
                return pageFile;
            }
            // /app/pages/foo/bar/index.hbs
            pageFile = new File(pagesDirPath + "/" + pageUri + "/index.hbs");
            if (pageFile.isExists()) {
                return pageFile;
            }

            var index = pageUri.lastIndexOf("/");
            // pathParams.push(pageUri.substr(index + 1));
            pageUri = pageUri.substr(0, index);
        } while (pageUri.length > 1);

        // page not found 404
        return null;
    }

    /**
     * Renders pushed units to the specified page.
     * @param pageUri {string} page URI
     * @param handlebarsEnvironment {Object} current Handlebars environment
     * @param lookUpTable {{layouts: Object.<string, string>, units: Object.<string, {shortName:
     *     string, path: string, definition: Object}>, pushedUnits: Object.<string, string[]>}}
     *     lookup table
     */
    function renderPushedUnits(pageUri, handlebarsEnvironment, lookUpTable) {
        var uriMatcher = new URIMatcher(pageUri);
        /**
         * @type {Object.<string, string[]>}
         */
        var allPushedUnits = lookUpTable.pushedUnits;
        var uriPatterns = Object.keys(allPushedUnits);
        var pushedUnitsHbs = "";
        for (var i = 0; i < uriPatterns.length; i++) {
            var uriPattern = uriPatterns[i];
            if (uriMatcher.match(uriPattern)) {
                pushedUnitsHbs +=
                    '{{unit "' + allPushedUnits[uriPattern].join('"}}{{unit "') + '" }}';
            }
        }
        // TODO: implement a proper caching mechanism for 'pushedUnitsTemplate'
        var pushedUnitsTemplate = handlebarsEnvironment.compile(pushedUnitsHbs);
        pushedUnitsTemplate({});
    }

    /**
     * Renders the specified page.
     * @param pageFile {Object} page file
     * @param handlebarsEnvironment {Object} current Handlebars environment
     */
    function renderPage(pageFile, handlebarsEnvironment) {
        pageFile.open('r');
        // TODO: check whether trimming is necessary or not
        var content = pageFile.readAll().trim();
        pageFile.close();
        // TODO: implement a proper caching mechanism for 'pageTemplate'
        var pageTemplate = handlebarsEnvironment.compile(content);
        pageTemplate({});
    }

    /**
     * Renders the current layout.
     * @param response {Object} HTTP response object to be served
     * @param handlebarsEnvironment {Object} current Handlebars environment
     */
    function renderLayout(response, handlebarsEnvironment) {
        var layoutFile = new File(constants.DIRECTORY_APP_LAYOUTS + "/"
                                  + handlebarsEnvironment.renderingDataModel.currentLayout
                                  + ".hbs");
        layoutFile.open('r');
        // TODO: check whether trimming is necessary or not
        var content = layoutFile.readAll().trim();
        layoutFile.close();
        // TODO: implement a proper caching mechanism for 'layoutTemplate'
        var layoutTemplate = handlebarsEnvironment.compile(content);

        response.addHeader("Content-type", "text/html");
        print(layoutTemplate({}));
    }

    /**
     *
     * @param request
     * @param response
     * @param lookUpTable
     * @param configs
     */
    route = function (request, response, lookUpTable, configs) {
        // lets assume URL looks like https://my.domain.com/app/{one}/{two}/{three}/{four}
        var uri = request.getRequestURI(); // = /app/{one}/{two}/{three}/{four}
        var positionOfSecondSlash = uri.indexOf("/", 1);
        var pageUri = uri.substring(positionOfSecondSlash); // /{one}/{two}/{three}/{four}
        var pageFile = getPageFile(pageUri);
        if (!pageFile) {
            response.sendError(404, "Requested page not found");
            return;
        }

        lookUpTable.appName = uri.substring(1, positionOfSecondSlash);

        var handlebarsEnvironment = getHandlebarsEnvironment(request, lookUpTable, configs);
        renderPushedUnits(uri, handlebarsEnvironment, lookUpTable);
        renderPage(pageFile, handlebarsEnvironment);
        renderLayout(response, handlebarsEnvironment);
    };

})();
