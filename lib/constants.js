/**
 * Application constants.
 * @type {{DIRECTORY_APP_ROOT: string, DIRECTORY_APP_LAYOUTS: string, DIRECTORY_APP_PAGES: string,
 *     DIRECTORY_APP_UNITS: string, DIRECTORY_APP_UNIT_PUBLIC: string, DIRECTORY_CACHE: string,
 *     DIRECTORY_DEBUG: string, FILE_APP_CONF: string, LIBRARY_HANDLEBARS: string, LIBRARY_LESS:
 *     string, CONF_DISPLAY_NAME: string, CONF_CACHE_ENABLED: string, CONF_DEBUGGING_ENABLED:
 *     string, CONF_LOG_LEVEL: string, CONF_WELCOME_FILE: string, CONF_ERROR_PAGES: string,
 *     CONF_SECURITY_CONSTRAINTS: string}}
 */
var constants;

(function () {
    var cachedConstants = application.get("uuf.constants");
    if (cachedConstants) {
        constants = cachedConstants;
        return;
    }
    constants = {
        // paths
        DIRECTORY_APP_ROOT: "/app",
        DIRECTORY_APP_LAYOUTS: "/app/layouts",
        DIRECTORY_APP_PAGES: "/app/pages",
        DIRECTORY_APP_UNITS: "/app/units",
        DIRECTORY_APP_UNIT_PUBLIC: "/public",
        DIRECTORY_CACHE: "/cache",
        DIRECTORY_DEBUG: "/debug",
        FILE_APP_CONF: "/app/app-conf.json",
        // libraries
        LIBRARY_HANDLEBARS: "handlebars-v2.0.0.js",
        LIBRARY_LESS: "less-rhino-1.7.5.js",
        // app configurations
        CONF_DISPLAY_NAME: "displayName",
        CONF_CACHE_ENABLED: "cachingEnabled",
        CONF_DEBUGGING_ENABLED: "debuggingEnabled",
        CONF_LOG_LEVEL: "logLevel",
        CONF_WELCOME_FILE: "welcomeFile",
        CONF_ERROR_PAGES: "errorPages",
        CONF_SECURITY_CONSTRAINTS: "securityConstraints",
        // unit's JS functions
        UNIT_JS_FUNCTION_BEFORE_RENDERING: "beforeRendering",
        UNIT_JS_FUNCTION_ON_REQUEST: "onRequest",
        UNIT_JS_FUNCTION_AFTER_RENDERING: "afterRendering",
        // unit's definition
        UNIT_DEFINITION_VERSION: "version",
        UNIT_DEFINITION_EXTEND: "extends",
        UNIT_DEFINITION_SCOPE: "scope",
        UNIT_DEFINITION_SCOPE_URL_PATTERNS: "urlPatterns",
        UNIT_DEFINITION_SCOPE_PERMISSIONS: "permissions"
    };
    application.put("uuf.constants", constants);
})();
