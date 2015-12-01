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
 * @param username {string} username
 * @param password {string} password
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

(function () {
    var log = new Log("auth-module");
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
     * @return {Object.<string, string>} SSO configurations
     */
    function getLoginConfigurations() {
        var authModuleConfigs = getAuthModuleConfigurations();
        var loginConfigs = authModuleConfigs[constants.APP_CONF_AUTH_MODULE_LOGIN];
        if (loginConfigs) {
            return loginConfigs;
        } else {
            log.error("Cannot find login configurations in Auth module configurations in "
                      + "application configuration file '" + constants.FILE_APP_CONF + "'.");
            return {};
        }
    }

    /**
     * Return logout configurations.
     * @return {Object.<string, string>} SSO configurations
     */
    function getLogoutConfigurations() {
        var authModuleConfigs = getAuthModuleConfigurations();
        var logoutConfigs = authModuleConfigs[constants.APP_CONF_AUTH_MODULE_LOGIN];
        if (logoutConfigs) {
            return logoutConfigs;
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

    /**
     * Returns the relay state.
     * @param operation {string} either "login" or "logout"
     * @return {string} relay state
     */
    function getRelayState(operation) {
        var referer = request.getHeader("referer");
        if (referer) {
            var queryString = request.getQueryString();
            if (queryString && (queryString.length > 0)) {
                return (referer + "?" + queryString);
            } else {
                return referer;
            }

        } else {
            var afterUri;
            if (operation == "login") {
                var loginConfigs = getLoginConfigurations();
                afterUri = loginConfigs[constants.APP_CONF_AUTH_MODULE_LOGIN_ON_SUCCESS];
            } else {
                var logoutConfigs = getLogoutConfigurations();
                afterUri = logoutConfigs[constants.APP_CONF_AUTH_MODULE_LOGOUT_ON_SUCCESS];
            }
            if (afterUri) {
                return afterUri;
            } else {
                return (request.getContextPath() + "/");
            }
        }
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
            log.error(e);
            response.sendError(500, e.message);
            return null;
        }

        return {
            identityProviderUrl: identityProviderUrl,
            encodedSAMLAuthRequest: encodedSAMLAuthRequest,
            relayState: getRelayState("login"),
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
            log.error(e);
            response.sendError(500, e.message);
            return null;
        }

        return {
            identityProviderUrl: identityProviderUrl,
            encodedSAMLAuthRequest: encodedSAMLAuthRequest,
            relayState: getRelayState("logout"),
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
        var samlResponseObj = ssoClient.getSamlObject(samlResponse);
        if (ssoClient.isLogoutResponse(samlResponseObj)) {
            // This is a logout response.
            if (log.isDebugEnabled()) {
                log.debug("User '" + getCurrentUser().username + "' logging out.");
            }
            session.invalidate();
            response.sendRedirect(getRelayState("logout"));
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
            if (ssoSession) {
                var ssoSessions = getSsoSessions();
                ssoSessions[ssoSession.sessionId] = ssoSession;
                var carbonUser = (require("carbon")).server.tenantUser(ssoSession.loggedInUser);
                setCurrentUser(carbonUser.username, carbonUser.domain, carbonUser.tenantId);
                var relayState = request.getParameter("RelayState");
                if (relayState) {
                    response.sendRedirect(relayState);
                } else {
                    response.sendRedirect(getRelayState("login"));
                }
            } else {
                var msg = "Cannot decode SAML login response.";
                log.error(msg);
                response.sendError(500, msg);
            }
        }
    };

    login = function (username, password) {
        try {
            var carbonServer = require("carbon").server;
            var isAuthenticated = (new carbonServer.Server()).authenticate(username, password);
            if (isAuthenticated) {
                var tenantUser = carbonServer.tenantUser(username);
                setCurrentUser(tenantUser.username, tenantUser.domain, tenantUser.tenantId);
                response.sendRedirect(getRelayState("login"));
            } else {
                var loginConfigs = getLoginConfigurations();
                var onFailUrl = loginConfigs[constants.APP_CONF_AUTH_MODULE_LOGIN_ON_FAIL];
                if (onFailUrl) {
                    response.sendRedirect(onFailUrl + "?error=Incorrect+username+or+password");
                } else {
                    response.sendRedirect(request.getContextPath() + "/");
                }
            }
        } catch (e) {
            log.error(e);
            var loginConfigs = getLoginConfigurations();
            var onFailUrl = loginConfigs[constants.APP_CONF_AUTH_MODULE_LOGIN_ON_FAIL];
            if (onFailUrl) {
                response.sendRedirect(onFailUrl + "?error=Server+error+occurred");
            } else {
                response.sendRedirect(request.getContextPath() + "/");
            }
        }
    };

    logout = function () {
        session.invalidate();
        response.sendRedirect(getRelayState("logout"));
    };
})();