function DynamicRouter() {

    var log = new Log("[dynamic-file-router]");

    function getHandlebarsEnvironment(request, lookUpTable, configs) {
        return (require("rendering-handlebars-helpers.js")).registerHelpers(request, lookUpTable,
                                                                            configs);
    }

    /**
     * Returns a File object to the specified page.
     * @param pageUri {string} page path requested in the URL
     * @param configs {Object} configurations
     * @return {File} requested page file
     */
    function getPageFile(pageUri, configs) {
        var pagesDirPath = configs.constants.DIRECTORY_APP_PAGES;
        /*
         * Page URI "/foo/bar/foobar" or "/foo/bar/foobar/" can be mapped to following pages.
         *  /foo/bar/foobar.hbs         pathParams = []
         *  /foo/bar/foobar/index.hbs   pathParams = []
         *  /foo/bar.hbs                pathParams = ["foobar"]
         *  /foo/bar/index.hbs          pathParams = ["foobar"]
         *  /foo.hbs                    pathParams = ["foobar", "bar"]
         *  /foo/index.hbs              pathParams = ["foobar", "bar"]
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

    function renderPushedUnits(pageUri, lookUpTable, handlebarsEnvironment) {
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

    function renderPage(pageFile, handlebarsEnvironment) {
        pageFile.open('r');
        // TODO: check whether trimming is necessary or not
        var content = pageFile.readAll().trim();
        pageFile.close();
        // TODO: implement a proper caching mechanism for 'pageTemplate'
        var pageTemplate = handlebarsEnvironment.compile(content);
        pageTemplate({});
    }

    function renderLayout(handlebarsEnvironment, configs, response) {
        var layoutFile = new File(configs.constants.DIRECTORY_APP_LAYOUTS + "/"
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

    this.route = function (request, response, lookUpTable, configs) {
        // lets assume URL looks like https://my.domain.com/app/{one}/{two}/{three}/{four}
        var uri = request.getRequestURI(); // = /app/{one}/{two}/{three}/{four}
        var positionOfSecondSlash = uri.indexOf("/", 1);
        var pageUri = uri.substring(positionOfSecondSlash); // /{one}/{two}/{three}/{four}
        var pageFile = getPageFile(pageUri, configs);
        if (!pageFile) {
            response.sendError(404, "Requested page not found");
            return;
        }

        lookUpTable.appName = uri.substring(1, positionOfSecondSlash);

        var handlebarsEnvironment = getHandlebarsEnvironment(request, lookUpTable, configs);
        renderPushedUnits(uri, lookUpTable, handlebarsEnvironment);
        renderPage(pageFile, handlebarsEnvironment);
        renderLayout(handlebarsEnvironment, configs, response);
    };

}
