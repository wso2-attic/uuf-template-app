/**
 * Returns whether the authentication module is enabled or disabled in the configurations.
 * @return {boolean} if authentication module is enabled <code>true</code>, otherwise
 *     <code>false</code>
 */
var isEnabled;

/**
 * Returns whether the Single Sign-on feature is enabled or disabled in the authentication module.
 * @return {boolean} if SSO is enabled <code>true</code>, otherwise <code>false</code>
 */
var isSsoEnabled;

/**
 * Returns necessary HTTP POST parameters for a SSO login(authentication) request.
 * @return {{identityProviderUrl: string, encodedSAMLAuthRequest, string, relayState: string,
 *     sessionId: string}} parameters
 */
var getSsoLoginRequestParams;

/**
 * Returns necessary HTTP POST parameters for a SSO logout request.
 * @return {{identityProviderUrl: string, encodedSAMLAuthRequest, string, relayState: string,
 *     sessionId: string}} parameters
 */
var getSsoLogoutRequestParams;

/**
 * SSO Assertion Consumer Service.
 */
var ssoAcs;

/**
 * Login the specified user.
 */
var login;

/**
 * Logs-out the current user.
 */
var logout;

/**
 * Returns the current logged-in user.
 * @returns {{username: string, domain: string, tenantId: string}}
 */
var getCurrentUser;

/**
 * Returns the web app context path.
 * @returns {string} app context path
 */
var getAppContext;

(function () {
    var log = new Log("auth-module");
    var OPERATION_LOGIN = "login";
    var OPERATION_LOGOUT = "logout";
    var EVENT_SUCCESS = "success";
    var EVENT_FAIL = "fail";
    var constants = require("/lib/constants.js").constants;
    /** @type {UtilsModule} */
    var Utils = require("/lib/utils.js");

    /**
     * Returns the configurations of the 'uuf.auth' module.
     * @return {Object} configurations of the 'uuf.auth' modules
     */
    function getAuthModuleConfigurations() {
        var userModuleConfigs = Utils.getAppConfigurations()[constants.APP_CONF_AUTH_MODULE];
        if (userModuleConfigs) {
            return userModuleConfigs;
        } else {
            log.error("Cannot find User module configurations in application configuration file '"
                      + constants.FILE_APP_CONF + "'.");
            return {};
        }
    }

    /**
     * Return login configurations.
     * @param event {?string} on success or on fail
     * @return {Object.<string, string>} SSO configurations
     */
    function getLoginConfigurations(event) {
        var authModuleConfigs = getAuthModuleConfigurations();
        var loginConfigs = authModuleConfigs[constants.APP_CONF_AUTH_MODULE_LOGIN];
        if (loginConfigs) {
            var rv;
            switch (event) {
                case EVENT_SUCCESS:
                    rv = loginConfigs[constants.APP_CONF_AUTH_MODULE_LOGIN_ON_SUCCESS];
                    break;
                case EVENT_FAIL:
                    rv = loginConfigs[constants.APP_CONF_AUTH_MODULE_LOGIN_ON_FAIL];
                    break;
                default:
                    rv = loginConfigs;
            }
            return (rv) ? rv : {};
        } else {
            log.error("Cannot find login configurations in Auth module configurations in "
                      + "application configuration file '" + constants.FILE_APP_CONF + "'.");
            return {};
        }
    }

    /**
     * Return logout configurations.
     * @param event {string} on success or on fail
     * @return {Object.<string, string>} SSO configurations
     */
    function getLogoutConfigurations(event) {
        var authModuleConfigs = getAuthModuleConfigurations();
        var logoutConfigs = authModuleConfigs[constants.APP_CONF_AUTH_MODULE_LOGOUT];
        if (logoutConfigs) {
            var rv;
            switch (event) {
                case EVENT_SUCCESS:
                    rv = logoutConfigs[constants.APP_CONF_AUTH_MODULE_LOGOUT_ON_SUCCESS];
                    break;
                case EVENT_FAIL:
                    rv = logoutConfigs[constants.APP_CONF_AUTH_MODULE_LOGOUT_ON_FAIL];
                    break;
                default:
                    rv = logoutConfigs;
            }
            return (rv) ? rv : {};
        } else {
            log.error("Cannot find logout configurations in Auth module configurations in "
                      + "application configuration file '" + constants.FILE_APP_CONF + "'.");
            return {};
        }
    }

    /**
     * Return SSO configurations.
     * @return {Object.<string, string>} SSO configurations
     */
    function getSsoConfigurations() {
        var authModuleConfigs = getAuthModuleConfigurations();
        var ssoConfigs = authModuleConfigs[constants.APP_CONF_AUTH_MODULE_SSO];
        if (ssoConfigs) {
            return ssoConfigs;
        } else {
            log.error("Cannot find SSO configurations in Auth module configurations in application "
                      + "configuration file '" + constants.FILE_APP_CONF + "'.");
            return {};
        }
    }

    function getRedirectUri(operation, event) {
        var configs, pageFullName;
        if (operation == OPERATION_LOGIN) {
            configs = getLoginConfigurations(event);
            pageFullName = (event == EVENT_SUCCESS) ?
                           configs[constants.APP_CONF_AUTH_MODULE_LOGIN_ON_SUCCESS_PAGE] :
                           configs[constants.APP_CONF_AUTH_MODULE_LOGIN_ON_FAIL_PAGE];
        } else {
            configs = getLogoutConfigurations(event);
            pageFullName = (event == EVENT_SUCCESS) ?
                           configs[constants.APP_CONF_AUTH_MODULE_LOGOUT_ON_SUCCESS_PAGE] :
                           configs[constants.APP_CONF_AUTH_MODULE_LOGOUT_ON_FAIL_PAGE];
        }

        var redirectUri;
        if (pageFullName && (pageFullName.length != 0)) {
            var page = Utils.getLookupTable(Utils.getAppConfigurations()).pages[pageFullName];
            if (page) {
                redirectUri = getAppContext() + page.definition[constants.PAGE_DEFINITION_URI];
            } else {
                log.error("Page '" + pageFullName + "' mentioned in Auth module configurations in "
                          + "application configuration file '" + constants.FILE_APP_CONF
                          + "' does not exists.");
                redirectUri = getAppContext() + "/";
            }
        } else {
            redirectUri = getAppContext() + "/";
        }
        return redirectUri;
    }

    /**
     * Returns the relay state.
     * @param operation {string} either "login" or "logout"
     * @return {string} relay state
     */
    function getRelayState(operation) {
        var paramReferer = request.getParameter(constants.URL_PARAM_REFERER);
        if (paramReferer && (paramReferer.length > 0)) {
            return paramReferer;
        }
        var relayState = request.getParameter("RelayState");
        if (relayState && (relayState.length > 0)) {
            return relayState;
        }
        return getRedirectUri(operation, EVENT_SUCCESS);
    }

    function executeScript(operation, event, argument) {
        var configs, scriptFilePath;
        if (operation == OPERATION_LOGIN) {
            configs = getLoginConfigurations(event);
            scriptFilePath = (event == EVENT_SUCCESS) ?
                             configs[constants.APP_CONF_AUTH_MODULE_LOGIN_ON_SUCCESS_SCRIPT] :
                             configs[constants.APP_CONF_AUTH_MODULE_LOGIN_ON_FAIL_SCRIPT];
        } else {
            configs = getLogoutConfigurations(event);
            scriptFilePath = (event == EVENT_SUCCESS) ?
                             configs[constants.APP_CONF_AUTH_MODULE_LOGOUT_ON_SUCCESS_SCRIPT] :
                             configs[constants.APP_CONF_AUTH_MODULE_LOGOUT_ON_FAIL_SCRIPT];
        }

        if (!scriptFilePath || (scriptFilePath.length == 0)) {
            return true;
        }
        var scriptFile = new File(scriptFilePath);
        if (!scriptFile.isExists() || scriptFile.isDirectory()) {
            log.error("Script '" + scriptFilePath + "' mentioned in Auth module configurations in "
                      + "application configuration file '" + constants.FILE_APP_CONF
                      + "' does not exists.");
            return true;
        }

        try {
            var script = require(scriptFilePath);
            var functionName = (event == EVENT_SUCCESS) ? "onSuccess" : "onFail";
            if (script[functionName]) {
                script[functionName](argument);
            }
            return true;
        } catch (e) {
            log.error("An exception thrown when executing the script '" + scriptFilePath + "'.");
            if ((typeof e) == "string") {
                // JS "throw message" type errors
                log.error(e);
                response.sendError(500, e);
            } else {
                if (e.stack) {
                    // Java/Rhino Exceptions
                    log.error(e.message, e);
                    response.sendError(500, e.message);
                } else if (e.message) {
                    // JS "throw new Error(message)" type errors
                    log.error(e.message);
                    response.sendError(500, e.message);
                }
            }
            return false;
        }
    }

    function handleEvent(operation, event, scriptArgument) {
        if (!executeScript(operation, event, scriptArgument)) {
            return; // Some error occurred when executing the script.
        }
        var redirectUri;
        if (event == EVENT_SUCCESS) {
            redirectUri = getRelayState(operation);
        } else {
            // event == EVENT_FAIL
            redirectUri = getRedirectUri(operation, EVENT_FAIL) + "?error=" + scriptArgument.message
                          + "&" + constants.URL_PARAM_REFERER + "=" + getRelayState(operation);
        }
        response.sendRedirect(encodeURI(redirectUri));
    }

    /**
     * Returns SSO sessions map.
     * @return {Object.<string, {sessionId: string, loggedInUser: string, sessionIndex: string,
     *     samlToken: string}>} SSO sessions
     */
    function getSsoSessions() {
        var ssoSessions = session.get(constants.CACHE_KEY_SSO_SESSIONS);
        if (!ssoSessions) {
            ssoSessions = {};
            session.put(constants.CACHE_KEY_SSO_SESSIONS, ssoSessions);
        }
        return ssoSessions;
    }

    function setCurrentUser(username, domain, tenantId) {
        Utils.setCurrentUser(username, domain, tenantId);
    }

    getCurrentUser = function () {
        return Utils.getCurrentUser();
    };

    getAppContext = function () {
        return Utils.getAppContext(request);
    };

    isEnabled = function () {
        var userModuleConfigs = getAuthModuleConfigurations();
        return Utils.parseBoolean(userModuleConfigs[constants.APP_CONF_AUTH_MODULE_ENABLED],
                                  false);
    };

    isSsoEnabled = function () {
        var ssoConfigs = getSsoConfigurations();
        return Utils.parseBoolean(ssoConfigs[constants.APP_CONF_AUTH_MODULE_SSO_ENABLED], false);
    };

    getSsoLoginRequestParams = function () {
        var ssoConfigs = getSsoConfigurations();
        // Identity Provider URL
        var identityProviderUrl = ssoConfigs[constants.APP_CONF_AUTH_MODULE_SSO_IDENTITY_PROVIDER_URL];
        if (!identityProviderUrl || (identityProviderUrl.length == 0)) {
            var msg = "Identity Provider URL is not given in SSO configurations in Auth module "
                      + "configurations in application configuration file '"
                      + constants.FILE_APP_CONF + "'.";
            log.error(msg);
            response.sendError(500, msg);
            return null;
        }
        // Issuer
        var issuer = ssoConfigs[constants.APP_CONF_AUTH_MODULE_SSO_ISSUER];
        if (!issuer || (issuer.length == 0)) {
            var msg = "Issuer is not given in SSO configurations in Auth module configurations in "
                      + "application configuration file '" + constants.FILE_APP_CONF + "'.";
            log.error(msg);
            response.sendError(500, msg);
            return null;
        }
        // SAML authentication request
        var encodedSAMLAuthRequest;
        try {
            encodedSAMLAuthRequest = (require("sso")).client.getEncodedSAMLAuthRequest(issuer);
        } catch (e) {
            log.error("Cannot create SAML login authorization token with issuer '" + issuer + "'.");
            log.error(e.message, e);
            response.sendError(500, e.message);
            return null;
        }

        return {
            identityProviderUrl: identityProviderUrl,
            encodedSAMLAuthRequest: encodedSAMLAuthRequest,
            relayState: getRelayState(OPERATION_LOGIN),
            sessionId: session.getId()
        }
    };

    getSsoLogoutRequestParams = function () {
        var ssoConfigs = getSsoConfigurations();
        // Identity Provider URL
        var identityProviderUrl = ssoConfigs[constants.APP_CONF_AUTH_MODULE_SSO_IDENTITY_PROVIDER_URL];
        if (!identityProviderUrl || (identityProviderUrl.length == 0)) {
            var msg = "Identity Provider URL is not given in SSO configurations in Auth module "
                      + "configurations in application configuration file '"
                      + constants.FILE_APP_CONF + "'.";
            log.error(msg);
            response.sendError(500, msg);
            return null;
        }
        // Session ID, Username, SSO Session Index
        var sessionId = session.getId();
        var ssoSession = getSsoSessions()[sessionId];
        var username = ssoSession.loggedInUser;
        var ssoSessionIndex = (ssoSession.sessionIndex) ? ssoSession.sessionIndex : null;
        // Issuer
        var issuer = ssoConfigs[constants.APP_CONF_AUTH_MODULE_SSO_ISSUER];
        if (!issuer || (issuer.length == 0)) {
            var msg = "Issuer is not given in SSO configurations in Auth module configurations in "
                      + "application configuration file '" + constants.FILE_APP_CONF + "'.";
            log.error(msg);
            response.sendError(500, msg);
            return null;
        }
        // SAML authentication request
        var encodedSAMLAuthRequest;
        try {
            var ssoClient = require("sso").client;
            encodedSAMLAuthRequest = ssoClient.getEncodedSAMLLogoutRequest(username,
                                                                           ssoSessionIndex, issuer);
        } catch (e) {
            log.error("Cannot create SAML logout authorization token for user '" + username
                      + "'  with issuer '" + issuer + "'.");
            log.error(e.message, e);
            response.sendError(500, e.message);
            return null;
        }

        return {
            identityProviderUrl: identityProviderUrl,
            encodedSAMLAuthRequest: encodedSAMLAuthRequest,
            relayState: getRelayState(OPERATION_LOGOUT),
            sessionId: sessionId
        }
    };

    ssoAcs = function () {
        var samlResponse = request.getParameter("SAMLResponse");
        if (!samlResponse) {
            var msg = "SAML response is not found in request parameters.";
            log.error(msg);
            response.sendError(400, msg);
            return;
        }
        var ssoClient = require("sso").client;
        var samlResponseObj;
        try {
            samlResponseObj = ssoClient.getSamlObject(samlResponse);
        } catch (e) {
            log.error(e.message, e);
            response.sendError(500, e.message);
            return;
        }

        if (ssoClient.isLogoutResponse(samlResponseObj)) {
            // This is a logout response.
            logout();
        } else {
            // This is a login response.
            var ssoConfigs = getSsoConfigurations();
            var rsEnabled = ssoConfigs[constants.APP_CONF_AUTH_MODULE_SSO_RESPONSE_SIGNING_ENABLED];
            if (Utils.parseBoolean(rsEnabled, false)) {
                // Response signing is enabled.
                var keyStoreParams = {
                    KEY_STORE_NAME: ssoConfigs[constants.APP_CONF_AUTH_MODULE_SSO_KEY_STORE_NAME],
                    KEY_STORE_PASSWORD: ssoConfigs[constants.APP_CONF_AUTH_MODULE_SSO_KEY_STORE_PASSWORD],
                    IDP_ALIAS: ssoConfigs[constants.APP_CONF_AUTH_MODULE_SSO_IDENTITY_PROVIDER_ALIAS]
                };
                if (!ssoClient.validateSignature(samlResponseObj, keyStoreParams)) {
                    var msg = "Invalid signature found in the SAML response.";
                    log.error(msg);
                    response.sendError(500, msg);
                    return;
                }
            }
            /**
             * @type {{sessionId: string, loggedInUser: string, sessionIndex: string, samlToken:
             *     string}}
             */
            var ssoSession = ssoClient.decodeSAMLLoginResponse(samlResponseObj, samlResponse,
                                                               session.getId());
            if (ssoSession.sessionId) {
                var ssoSessions = getSsoSessions();
                ssoSessions[ssoSession.sessionId] = ssoSession;
                var carbonUser = (require("carbon")).server.tenantUser(ssoSession.loggedInUser);
                setCurrentUser(carbonUser.username, carbonUser.domain, carbonUser.tenantId);
                var scriptArgument = {input: {}, user: getCurrentUser()};
                handleEvent(OPERATION_LOGIN, EVENT_SUCCESS, scriptArgument);
            } else {
                var msg = "Cannot decode SAML login response.";
                log.error(msg);
                response.sendError(500, msg);
            }
        }
    };

    login = function () {
        var username = request.getParameter("username");
        if (!username || (username.length == 0)) {
            var error = new Error("Please enter username.");
            handleEvent(OPERATION_LOGIN, EVENT_FAIL, error);
            return;
        }
        var password = request.getParameter("password");
        if (!password || (password.length == 0)) {
            var error = new Error("Please enter password.");
            handleEvent(OPERATION_LOGIN, EVENT_FAIL, error);
            return;
        }

        var carbonServer = require("carbon").server;
        var isAuthenticated;
        try {
            isAuthenticated = (new carbonServer.Server()).authenticate(username, password);
        } catch (e) {
            log.error(e.message, e);
            response.sendError(500, e.message);
            return;
        }
        if (isAuthenticated) {
            var tenantUser = carbonServer.tenantUser(username);
            setCurrentUser(tenantUser.username, tenantUser.domain, tenantUser.tenantId);
            var scriptArgument = {
                input: {username: username, password: password},
                user: getCurrentUser()
            };
            handleEvent(OPERATION_LOGIN, EVENT_SUCCESS, scriptArgument);
        } else {
            var error = new Error("Incorrect username or password");
            handleEvent(OPERATION_LOGIN, EVENT_FAIL, error);
        }
    };

    logout = function () {
        var previousUser = getCurrentUser();
        try {
            session.invalidate();
        } catch (e) {
            log.error(e.message, e);
            response.sendError(500, e.message);
            return;
        }
        if (log.isDebugEnabled()) {
            log.debug("User '" + previousUser.username + "' logged out.");
        }
        var scriptArgument = {input: {}, user: previousUser};
        handleEvent(OPERATION_LOGOUT, EVENT_SUCCESS, scriptArgument);
    };
})();