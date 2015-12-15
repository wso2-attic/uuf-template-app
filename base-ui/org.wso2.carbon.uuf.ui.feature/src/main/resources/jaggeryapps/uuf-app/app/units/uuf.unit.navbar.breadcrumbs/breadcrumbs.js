function onRequest(context) {
    var mappingsFile = getFile("private/mappings.json");
    if (!mappingsFile) {
        return {};
    }

    var requestUri = request.getRequestURI(); // /appName/{one}/{two}/{three}/{four}
    var pageUri = requestUri.substring(requestUri.indexOf("/", 1)); // /{one}/{two}/{three}/{four}
    var uriMatcher = new URIMatcher(pageUri);

    var mappings = require(mappingsFile.getPath());
    var uriPatterns = Object.keys(mappings);
    var numberOfUriPatterns = uriPatterns.length;
    for (var i = 0; i < numberOfUriPatterns; i++) {
        var uriPattern = uriPatterns[i];
        if (uriMatcher.match(uriPattern)) {
            return {
                items: mappings[uriPattern]
            };
        }
    }
    return {};
}