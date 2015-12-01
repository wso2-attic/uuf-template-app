function onRequest(context) {
    var authModuleConfigs = context.app.conf["authModule"];
    if (authModuleConfigs && (authModuleConfigs["enabled"].toString() == "true")) {
        // Auth module is enabled.
        if (context.user) {
            // User is logged in.
            response.sendRedirect(context.app.context + "/uuf/logout");
            exit();
        } else {
            // User is already logged out.
            var onSuccessUrl;
            var logoutConfigs = authModuleConfigs["logout"];
            if (logoutConfigs) {
                // Auth module 'logout' configurations are available.
                onSuccessUrl = logoutConfigs["onSuccess"];
            }
            var redirectUrl = (onSuccessUrl) ? onSuccessUrl : (context.app.context + "/");
            response.sendRedirect(redirectUrl);
            exit();
        }
    }

}