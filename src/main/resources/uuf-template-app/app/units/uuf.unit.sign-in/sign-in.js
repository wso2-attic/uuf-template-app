function onRequest(context) {
    return {
        message: request.getParameter("error")
    };
}