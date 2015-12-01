function onRequest(context) {
    var authModuleConfigs = context.app.conf["authModule"];
    if (authModuleConfigs && (authModuleConfigs["enabled"].toString() == "true")) {
        // Auth module is enabled.
        if (context.user) {
            // User is already logged in.
            var onSuccessUrl;
            var loginConfigs = authModuleConfigs["login"];
            if (loginConfigs) {
                // Auth module 'login' configurations are available.
                onSuccessUrl = loginConfigs["onSuccess"];
            }
            var redirectUrl = (onSuccessUrl) ? onSuccessUrl : (context.app.context + "/");
            response.sendRedirect(redirectUrl);
            exit();
        } else {
            // User is not logged in.
            var ssoConfigs = authModuleConfigs["sso"];
            if (ssoConfigs && (ssoConfigs["enabled"].toString() == "true")) {
                // SSO is enabled in Auth module.
                response.sendRedirect(context.app.context + "/uuf/login");
                exit();
            } else {
                // Nothing do in this case.
            }
        }
    }
}