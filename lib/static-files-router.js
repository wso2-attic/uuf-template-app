/**
 * Process a HTTP request that requests a static file.
 * @param request {Object} HTTP request to be processed
 * @param response {Object} HTTP response to be served
 * @param lookUpTable {Object}
 * @param configs {Object} application configurations
 */
var route;

(function () {
    var log = new Log("[static-file-router]");
    var knownMimeTypes = {
        // text
        txt: 'text/plain',
        html: 'text/html',
        htm: 'text/html',
        js: 'application/x-javascript',
        css: 'text/css',
        xml: 'application/xml',
        hbs: 'text/x-handlebars-template',
        // fonts
        woff: 'application/font-woff',
        otf: 'application/font-sfnt',
        ttf: 'application/font-sfnt',
        // images
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        bmp: 'image/bmp',
        gif: 'image/gif',
        svg: 'image/svg+xml'
    };
    var constants = require("constants.js").constants;

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
     * Splits a full file name to its name and extension.
     * @param fullFileName {string} file name to be split e.g. foo.txt
     * @return {{name: string, extension: string}} splited parts
     */
    function splitFileName(fullFileName) {
        var index = fullFileName.lastIndexOf(".");
        return {name: fullFileName.substr(0, index), extension: fullFileName.substr(index + 1)}
    }

    /**
     *
     * @param unit {UIComponent} unit
     * @param resourceType {string} type of the resource
     * @param relativeFilePath {string} path to the file relative to its unit
     * @param lookupTable {LookupTable} lookup table
     * @return {Object} file
     */
    function getRequestedFile(unit, resourceType, relativeFilePath, lookupTable) {
        var correctedRelativeFilePath = null;
        if (resourceType == "less") {
            correctedRelativeFilePath = splitFileName(relativeFilePath).name + ".less";
        } else {
            correctedRelativeFilePath = relativeFilePath;
        }

        // Check in this unit
        var file = new File(unit.path + correctedRelativeFilePath);
        if (file.isExists() && !file.isDirectory()) {
            return file; // this unit has the file
        }

        var parentUnitsFullNames = unit.parents;
        var numberOfParentUnits = parentUnitsFullNames.length;
        for (var i = 0; i < numberOfParentUnits; i++) {
            var parentUnit = lookupTable.units[parentUnitsFullNames[i]];
            var parentFile = new File(parentUnit.path + correctedRelativeFilePath);
            if (parentFile.isExists() && !parentFile.isDirectory()) {
                return parentFile; // parent unit has the file
            }
        }

        return null;
    }

    function isLastModifiedDateEquals(file, request) {
        return (String(file.getLastModified()) == request.getHeader("If-Modified-Since"));
    }

    /**
     * Returns the MIME type of the specified file.
     * @param path {string} file path or name
     * @return {string} MIME type of the specified file
     */
    function getMimeType(path) {
        var extension = splitFileName(path).extension;
        if (!extension || extension.length == 0) {
            return knownMimeTypes['txt'];
        }
        var mimeType = knownMimeTypes[extension];
        if (mimeType) {
            return mimeType;
        }
        mimeType = knownMimeTypes[extension.toLowerCase()];
        if (mimeType) {
            return mimeType;
        }
        return knownMimeTypes['txt'];
    }

    function getLessParser() {
        var less = require(constants.LIBRARY_LESS).less;
        // Adapted from https://github.com/less/less.js/blob/v1.7.5/lib/less/rhino.js#L89
        less.Parser.fileLoader = function (file, currentFileInfo, callback, env) {
            var href = file;

            if (currentFileInfo && currentFileInfo.currentDirectory && !/^\//.test(file)) {
                href = less.modules.path.join(currentFileInfo.currentDirectory, file);
            }
            var path = less.modules.path.dirname(href);
            var newFileInfo = {
                currentDirectory: path,
                filename: href
            };

            if (currentFileInfo) {
                newFileInfo.entryPath = currentFileInfo.entryPath;
                newFileInfo.rootpath = currentFileInfo.rootpath;
                newFileInfo.rootFilename = currentFileInfo.rootFilename;
                newFileInfo.relativeUrls = currentFileInfo.relativeUrls;
            } else {
                newFileInfo.entryPath = path;
                newFileInfo.rootpath = less.rootpath || path;
                newFileInfo.rootFilename = href;
                newFileInfo.relativeUrls = env.relativeUrls;
            }

            var j = file.lastIndexOf('/');
            if (newFileInfo.relativeUrls && !/^(?:[a-z-]+:|\/)/.test(file) && j != -1) {
                var relativeSubDirectory = file.slice(0, j + 1);
                // append (sub|sup) directory  path of imported file
                newFileInfo.rootpath = newFileInfo.rootpath + relativeSubDirectory;
            }

            var data = null;
            var f = new File(href);
            try {
                f.open('r');
                data = f.readAll();
            } catch (e) {
                callback({
                    type: 'File',
                    message: "Cannot read '" + href + "' file."
                });
                return;
            } finally {
                f.close();
            }

            try {
                callback(null, data, href, newFileInfo, {lastModified: 0});
            } catch (e) {
                callback(e, null, href);
            }
        };

        // TODO: implement a proper caching mechanism for 'less'
        return less;
    }

    /**
     * Process the specified LESS file and generate CSS and write to the specified response.
     * @param lessFile {Object} file object of the processing LESS file
     * @param unit {UIComponent} fully qualified name of the unit
     * @param cssFileRelativePath {string} relative path to the CSS file
     * @param response {Object} HTTP response
     */
    function renderLess(lessFile, unit, cssFileRelativePath, response) {
        var cssFileName = cssFileRelativePath.substr(cssFileRelativePath.lastIndexOf("/") + 1);
        // cached CSS file name pattern: {unitFullName}_{cssFileName}.css
        var cacheFilePath = constants.DIRECTORY_CACHE + "/" + unit.fullName + "_" + cssFileName;
        var cacheFile = new File(cacheFilePath);

        var less = getLessParser();
        // Adapted from https://github.com/less/less.js/blob/v1.7.5/lib/less/rhino.js#L149
        var options = {
            depends: false,
            compress: false,
            cleancss: false,
            max_line_len: -1.0,
            optimization: 1.0,
            silent: false,
            verbose: false,
            lint: false,
            paths: [],
            color: true,
            strictImports: false,
            rootpath: "",
            relativeUrls: false,
            ieCompat: true,
            strictMath: false,
            strictUnits: false,
            filename: lessFile.getPath()
        };
        var lessParser = less.Parser(options);

        lessFile.open('r');
        var lessCode = lessFile.readAll();
        lessFile.close();
        var callback = function (error, root) {
            if (error) {
                // something went wrong when processing the LESS file
                log.error("Failed to process '" + lessFile.getPath() + "' file due to "
                          + stringify(error));
                response.sendError(500);
                return;
            }

            var result = root.toCSS(options);
            cacheFile.open('w');
            cacheFile.write(result);
            cacheFile.close();

            response.addHeader("Content-type", "text/css");
            response.addHeader("Cache-Control", "public,max-age=12960000");
            response.addHeader("Last-Modified", String(lessFile.getLastModified()));
            print(result);
        };
        var globalVars = {"unit-class": unit.shortName};
        lessParser.parse(lessCode, callback, {globalVars: globalVars});
    }

    route = function (request, response, lookupTable, configs) {
        // URI = /{appName}/public/{unitFullName}/{resourceType}/{+filePath}
        var uri = request.getRequestURI();
        var parts = uri.split("/");
        if (parts.length < 5) {
            // An invalid URI.
            log.warn("Request URI '" + uri + "' is invalid.");
            response.sendError(400);
            return;
        }
        if (parts.length == 5) {
            // An invalid URI. parts = ["", {appName}, "public", {unitFullName}, {fileName}]
            log.warn("Request URI '" + uri + "' is invalid. "
                     + "Uncategorized resources in unit's public directory are restricted.");
            response.sendError(400);
            return;
        }

        // For valid URIs : parts.length >= 6
        // parts = ["", "appName", "public", "unitFullName", "resourceType", ... ]
        var unit = lookupTable.units[parts[3]];
        if (!unit) {
            log.warn("Request unit '" + parts[3] + "' does not exists.");
            response.sendError(400);
            return;
        }

        var resourceType = parts[4];
        var relativeFilePath = constants.DIRECTORY_APP_UNIT_PUBLIC + uri.substr(parts[1].length
                               + parts[2].length + parts[3].length + 3);
        var requestedFile = getRequestedFile(unit, resourceType, relativeFilePath, lookupTable);
        if (!requestedFile) {
            // this file either does not exists or it is a directory
            log.warn("Requested file '" + relativeFilePath + "' does not exists in unit '"
                     + unit.fullName + "' or its parents " + stringify(unit.parents) + ".");
            response.sendError(404);
            return;
        }

        var isNoCache = parseBoolean(request.getParameter("nocache"), false);
        var isLMDEquals = isLastModifiedDateEquals(requestedFile, request);
        var isCachingEnabled = parseBoolean(configs[constants.APP_CONF_CACHE_ENABLED], true);
        if (!isNoCache && isLMDEquals && isCachingEnabled) {
            // requested file file has not changed since last serve
            response.status = 304;
            return;
        }

        if (resourceType == "less") {
            // process less and return css
            renderLess(requestedFile, unit, relativeFilePath, response);
        } else {
            response.addHeader("Content-type", getMimeType(parts[5]));
            response.addHeader("Cache-Control", "public,max-age=12960000");
            response.addHeader("Last-Modified", String(requestedFile.getLastModified()));
            requestedFile.open('r');
            print(requestedFile.getStream());
            requestedFile.close();
        }

    };
})();
