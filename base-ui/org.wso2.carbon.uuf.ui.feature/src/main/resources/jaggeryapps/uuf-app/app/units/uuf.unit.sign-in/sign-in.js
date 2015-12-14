function onRequest(context) {
    return {
        message: request.getParameter("error"),
        referer: request.getParameter("referer")
    };
}