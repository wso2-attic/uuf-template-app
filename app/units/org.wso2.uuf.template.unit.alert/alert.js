function onRequest(context) {
    var type = context.unit.params.type;
    switch (type) {
        case "success":
            return {icon: "fw-ok"};
        case "info":
            return {icon: "fw-info"};
        case "warning":
            return {icon: "fw-warning"};
        case "danger":
            return {icon: "fw-error"};
        default:
            return {icon: "fw-none"};
    }
}